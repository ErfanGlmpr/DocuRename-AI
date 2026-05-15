import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { PdfExtractionService } from '../pdf-extraction/pdf-extraction.service';
import { AiProviderFactory } from '../../ai/ai.factory';
import { FilenameGeneratorService } from '../../ai/filename-generator/filename-generator.service';
import { DocumentStatus } from '@prisma/client';

@Processor('document-processing')
export class DocumentProcessorService extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdfExtraction: PdfExtractionService,
    private readonly aiFactory: AiProviderFactory,
    private readonly filenameGenerator: FilenameGeneratorService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<{ documentId: string }>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Starting processing for document ${documentId}`);

    let document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      this.logger.error(`Document ${documentId} not found`);
      return;
    }

    try {
      // Step 2: Extract Text
      await this.updateStatus(documentId, DocumentStatus.EXTRACTING_TEXT);
      const fileBuffer = await this.storage.getObject(document.storageKey);
      
      let text = '';
      try {
        text = await this.pdfExtraction.extractText(fileBuffer);
      } catch (e) {
        throw new Error(e.message || 'Failed to extract text from PDF.');
      }

      // Step 3: Analyze with AI
      await this.updateStatus(documentId, DocumentStatus.ANALYZING_WITH_AI);
      const aiProvider = this.aiFactory.getProvider();
      
      const metadata = await aiProvider.extractDocumentMetadata({
        text,
        originalFilename: document.originalName,
      });

      // Step 4: Renaming
      await this.updateStatus(documentId, DocumentStatus.RENAMING);
      const generatedName = this.filenameGenerator.generateSafeFilename(metadata, document.originalName);
      
      const finalStorageKey = `documents/${documentId}/final/${generatedName}`;
      await this.storage.copyObject(document.storageKey, finalStorageKey);

      // Step 5: Completed or Needs Review
      const reviewThreshold = parseFloat(this.configService.get('AI_CONFIDENCE_REVIEW_THRESHOLD') || '0.7');
      const nextStatus = metadata.confidence && metadata.confidence < reviewThreshold
        ? DocumentStatus.NEEDS_REVIEW
        : DocumentStatus.COMPLETED;

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: nextStatus,
          generatedName,
          finalName: generatedName,
          finalStorageKey,
          aiProvider: aiProvider.name,
          title: metadata.title,
          category: metadata.category,
          documentDate: metadata.documentDate,
          issuer: metadata.issuer,
          recipient: metadata.recipient,
          referenceNumber: metadata.referenceNumber,
          summary: metadata.summary,
          confidence: metadata.confidence,
        },
      });

      this.logger.log(`Successfully processed document ${documentId}`);

    } catch (error) {
      this.logger.error(`Processing failed for document ${documentId}`, error);
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage: error.message || 'Unknown processing error',
        },
      });
    }
  }

  private async updateStatus(id: string, status: DocumentStatus) {
    await this.prisma.document.update({
      where: { id },
      data: { status },
    });
  }
}
