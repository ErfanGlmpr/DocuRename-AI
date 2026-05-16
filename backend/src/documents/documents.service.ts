import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentStatus, PrivacyMode, AiInputMode } from '@prisma/client';
import { CancellationService } from '../cancellation/cancellation.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cancellationService: CancellationService,
    @InjectQueue('document-processing') private documentQueue: Queue,
  ) {}

  async findAll() {
    return this.prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        finalName: true,
        generatedName: true,
        status: true,
        pageCount: true,
        category: true,
        confidence: true,
        createdAt: true,
        errorMessage: true,
        // Phase 2 Privacy Metadata
        piiDetected: true,
        piiEntityCount: true,
        privacyMode: true,
        aiInputMode: true,
        piiProcessedAt: true,
        processingDuration: true,
      },
    });
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }
    return document;
  }

  async findOnePublic(id: string): Promise<Record<string, unknown>> {
    const document = await this.findOne(id);

    // Remove sensitive fields

    const publicDocument: Record<string, unknown> = { ...document };
    delete publicDocument.piiTokenMapEncrypted;
    delete publicDocument.redactedText;
    delete publicDocument.storageKey;

    return publicDocument;
  }

  async updatePrivacyFields(
    id: string,
    data: {
      redactedText?: string;
      piiDetected?: boolean;
      piiEntityCount?: number;
      piiTokenMapEncrypted?: any;
      privacyMode?: PrivacyMode;
      aiInputMode?: AiInputMode;
      piiProcessedAt?: Date;
    },
  ) {
    return this.prisma.document.update({
      where: { id },
      data,
    });
  }

  async getDownloadUrl(id: string) {
    const document = await this.findOne(id);

    if (
      document.status !== DocumentStatus.COMPLETED &&
      document.status !== DocumentStatus.NEEDS_REVIEW
    ) {
      throw new BadRequestException('Document processing is not completed');
    }

    if (!document.finalStorageKey) {
      throw new BadRequestException('Final file not found');
    }

    const url = await this.storage.getPresignedDownloadUrl(
      document.finalStorageKey,
    );
    return { url };
  }

  async retryProcessing(id: string) {
    const document = await this.findOne(id);

    if (document.status !== DocumentStatus.FAILED) {
      throw new BadRequestException('Can only retry failed documents');
    }

    await this.prisma.document.update({
      where: { id },
      data: {
        status: DocumentStatus.QUEUED,
        errorMessage: null,
      },
    });

    await this.documentQueue.add('process-pdf', {
      documentId: id,
    });

    return { message: 'Document requeued' };
  }

  async updateFilename(id: string, newFilename: string) {
    let sanitized = newFilename
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, '-')
      .replace(/-+/g, '-');
    if (!sanitized.endsWith('.pdf')) {
      sanitized += '.pdf';
    }

    await this.findOne(id);

    const updated = await this.prisma.document.update({
      where: { id },
      data: { finalName: sanitized },
    });

    return updated;
  }

  async remove(id: string) {
    const document = await this.findOne(id);

    // Delete original file
    try {
      await this.storage.deleteObject(document.storageKey);
    } catch (error) {
      this.logger.warn(
        `Could not delete original file for document ${id}: ${(error as Error).message}`,
      );
    }

    // Delete final file if it exists
    if (document.finalStorageKey) {
      try {
        await this.storage.deleteObject(document.finalStorageKey);
      } catch (error) {
        this.logger.warn(
          `Could not delete final file for document ${id}: ${(error as Error).message}`,
        );
      }
    }

    // Delete database record
    await this.prisma.document.delete({ where: { id } });

    return { message: 'Document deleted successfully' };
  }

  async cancel(id: string) {
    const document = await this.findOne(id);

    if (
      document.status === DocumentStatus.COMPLETED ||
      document.status === DocumentStatus.FAILED ||
      document.status === DocumentStatus.NEEDS_REVIEW
    ) {
      throw new BadRequestException('Cannot cancel a finished document');
    }

    // Physically abort the AI request if it's active
    this.cancellationService.cancel(id);

    await this.prisma.document.update({
      where: { id },
      data: {
        status: DocumentStatus.FAILED,
        errorMessage: 'Stopped by user',
      },
    });

    return { message: 'Document processing canceled' };
  }
}
