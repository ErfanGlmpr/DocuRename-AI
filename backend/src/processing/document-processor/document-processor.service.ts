import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { PdfExtractionService } from '../pdf-extraction/pdf-extraction.service';
import { AiProviderFactory } from '../../ai/ai.factory';
import { FilenameGeneratorService } from '../../ai/filename-generator/filename-generator.service';
import { DocumentStatus, PrivacyMode, AiInputMode } from '@prisma/client';
import { PiiDetectionService } from '../../privacy/pii-detection.service';
import { PiiRedactionService } from '../../privacy/pii-redaction.service';
import { PiiTokenMapService } from '../../privacy/pii-token-map.service';
import { PromptMinimizationService } from '../prompt-minimization/prompt-minimization.service';
import { AuditService } from '../../audit/audit.service';
import { DocumentsService } from '../../documents/documents.service';
import { CancellationService } from '../../cancellation/cancellation.service';
import { sanitizeAiError } from '../../ai/utils/parse-ai-json';

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
    private readonly piiDetectionService: PiiDetectionService,
    private readonly piiRedactionService: PiiRedactionService,
    private readonly piiTokenMapService: PiiTokenMapService,
    private readonly promptMinimizationService: PromptMinimizationService,
    private readonly auditService: AuditService,
    private readonly cancellationService: CancellationService,
    @Inject(forwardRef(() => DocumentsService))
    private readonly documentsService: DocumentsService,
  ) {
    super();
  }

  async process(job: Job<{ documentId: string }>): Promise<void> {
    const { documentId } = job.data;
    const startTime = Date.now();
    this.logger.log(`Starting processing for document ${documentId}`);

    const signal = this.cancellationService.register(documentId);

    try {
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });
      if (!document) {
        this.logger.error(`Document ${documentId} not found`);
        return;
      }

      // Step 2: Extract Text
      await this.updateStatus(documentId, DocumentStatus.EXTRACTING_TEXT);
      const fileBuffer = await this.storage.getObject(document.storageKey);

      let extractedText = '';
      let pageCount = 0;
      try {
        const result = await this.pdfExtraction.extractText(fileBuffer);
        extractedText = result.text;
        pageCount = result.pageCount;

        // Update page count immediately
        await this.prisma.document.update({
          where: { id: documentId },
          data: { pageCount },
        });
      } catch (e: any) {
        throw new Error(
          (e as Error).message || 'Failed to extract text from PDF.',
        );
      }

      if (signal.aborted) throw new Error('AbortError');

      await this.auditService.log({
        documentId,
        action: 'DOCUMENT_TEXT_EXTRACTED',
        metadata: { extractedTextLength: extractedText.length },
      });

      let aiInputText: string;
      let aiInputMode: AiInputMode;

      // Phase 2 Privacy Pipeline
      if (this.configService.get('PII_REDACTION_ENABLED') !== 'false') {
        try {
          const entities = await this.piiDetectionService.detect(extractedText);
          if (signal.aborted) throw new Error('AbortError');

          await this.auditService.log({
            documentId,
            action: 'DOCUMENT_PII_DETECTED',
            metadata: {
              piiEntityCount: entities.length,
              piiTypes: [...new Set(entities.map((e) => e.type))],
            },
          });

          const redaction = await this.piiRedactionService.redact({
            text: extractedText,
            entities,
          });
          if (signal.aborted) throw new Error('AbortError');

          await this.auditService.log({
            documentId,
            action: 'DOCUMENT_PII_REDACTED',
            metadata: {
              redactedTextLength: redaction.redactedText.length,
              piiEntityCount: entities.length,
            },
          });

          const encryptedTokenMap =
            await this.piiTokenMapService.encryptTokenMap(redaction.tokenMap);

          await this.documentsService.updatePrivacyFields(documentId, {
            redactedText: redaction.redactedText,
            piiDetected: entities.length > 0,
            piiEntityCount: entities.length,
            piiTokenMapEncrypted: encryptedTokenMap,
            privacyMode: PrivacyMode.REDACTED,
            piiProcessedAt: new Date(),
          });

          const minimized = this.promptMinimizationService.minimize(
            redaction.redactedText,
          );

          if (!minimized.minimizedText.trim()) {
            throw new Error(
              'No usable text remained after privacy processing.',
            );
          }

          aiInputText = minimized.minimizedText;
          aiInputMode = AiInputMode.MINIMIZED_REDACTED_TEXT;
          // privacyMode = PrivacyMode.REDACTED; // unused

          await this.auditService.log({
            documentId,
            action: 'DOCUMENT_AI_INPUT_MINIMIZED',
            metadata: {
              originalLength: minimized.originalLength,
              minimizedLength: minimized.minimizedLength,
              strategy: minimized.strategy,
            },
          });
        } catch (error: any) {
          if ((error as Error).message === 'AbortError') throw error;
          await this.auditService.log({
            documentId,
            action: 'DOCUMENT_PRIVACY_PIPELINE_FAILED',
            metadata: { errorMessage: (error as Error).message },
          });
          throw error;
        }
      } else {
        this.logger.warn(
          `PII redaction is disabled for document ${documentId}`,
        );
        const minimized =
          this.promptMinimizationService.minimize(extractedText);

        aiInputText = minimized.minimizedText;
        aiInputMode = AiInputMode.RAW_TEXT;
        // privacyMode = PrivacyMode.NONE; // unused

        await this.documentsService.updatePrivacyFields(documentId, {
          privacyMode: PrivacyMode.NONE,
          aiInputMode: AiInputMode.RAW_TEXT,
        });
      }

      // Step 3: Analyze with AI
      await this.updateStatus(documentId, DocumentStatus.ANALYZING_WITH_AI);
      let aiProvider = this.aiFactory.getProvider();

      await this.auditService.log({
        documentId,
        action: 'DOCUMENT_AI_ANALYSIS_STARTED',
        metadata: {
          provider: aiProvider.name,
          model: aiProvider.model,
          aiInputMode,
        },
      });

      let metadata;
      let tokenUsage;
      let fallbackUsed = false;
      let aiDurationMs = 0;
      let aiStartTime = Date.now();

      try {
        const result = await aiProvider.extractDocumentMetadata(
          { text: aiInputText, originalFilename: document.originalName },
          signal,
        );
        metadata = result.metadata;
        tokenUsage = result.tokenUsage;
        aiDurationMs = Date.now() - aiStartTime;
      } catch (error: unknown) {
        const err = error as Error;
        if (err.name === 'AbortError' || err.message === 'AbortError')
          throw error;

        const fallback = this.aiFactory.getFallbackProvider();
        if (fallback) {
          const safeError = sanitizeAiError(error);
          this.logger.warn(
            `Primary AI provider failed, trying fallback (${fallback.name}): ${safeError}`,
          );
          fallbackUsed = true;
          aiProvider = fallback;
          aiStartTime = Date.now();

          await this.auditService.log({
            documentId,
            action: 'AI_PROVIDER_FALLBACK_USED',
            metadata: {
              primaryError: safeError,
              fallbackProvider: fallback.name,
            },
          });

          const result = await aiProvider.extractDocumentMetadata(
            { text: aiInputText, originalFilename: document.originalName },
            signal,
          );
          metadata = result.metadata;
          tokenUsage = result.tokenUsage;
          aiDurationMs = Date.now() - aiStartTime;
        } else {
          throw error;
        }
      }

      await this.auditService.log({
        documentId,
        action: 'DOCUMENT_AI_ANALYSIS_COMPLETED',
        metadata: {
          model: aiProvider.model,
          confidence: metadata.confidence,
          durationMs: aiDurationMs,
          tokenUsage,
          fallbackUsed,
        },
      });

      // Step 4: Renaming
      await this.updateStatus(documentId, DocumentStatus.RENAMING);
      const generatedName =
        this.filenameGenerator.generateSafeFilename(metadata);

      const finalStorageKey = `documents/${documentId}/final/${generatedName}`;
      await this.storage.copyObject(document.storageKey, finalStorageKey);

      // Step 5: Completed or Needs Review
      const reviewThreshold = parseFloat(
        this.configService.get('AI_CONFIDENCE_REVIEW_THRESHOLD') || '0.7',
      );
      const nextStatus =
        metadata.confidence && metadata.confidence < reviewThreshold
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
          aiModel: aiProvider.model,
          title: metadata.title,
          category: metadata.category,
          documentDate: metadata.documentDate,
          issuer: metadata.issuer,
          recipient: metadata.recipient,
          referenceNumber: metadata.referenceNumber,
          summary: metadata.summary,
          confidence: metadata.confidence,
          aiInputMode,
          processingDuration: Math.round((Date.now() - startTime) / 1000),
          promptTokens: tokenUsage?.promptTokens,
          completionTokens: tokenUsage?.completionTokens,
          totalTokens: tokenUsage?.totalTokens,
        },
      });

      this.logger.log(`Successfully processed document ${documentId}`);
    } catch (error: any) {
      if (
        (error as Error).message === 'AbortError' ||
        (error as Error).name === 'AbortError'
      ) {
        this.logger.warn(`Processing aborted for document ${documentId}`);
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.FAILED,
            errorMessage: 'Stopped by user',
          },
        });
        return;
      }
      this.logger.error(`Processing failed for document ${documentId}`, error);
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage: sanitizeAiError(error) || 'Unknown processing error',
        },
      });
    } finally {
      this.cancellationService.unregister(documentId);
    }
  }

  private async updateStatus(id: string, status: DocumentStatus) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      select: { status: true },
    });
    if (
      doc?.status === DocumentStatus.FAILED ||
      doc?.status === DocumentStatus.COMPLETED
    ) {
      this.logger.warn(
        `Skipping status update to ${status} for document ${id} because it is already ${doc.status}`,
      );
      return;
    }
    await this.prisma.document.update({
      where: { id },
      data: { status },
    });
  }
}
