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

  // ─── Organization-scoped queries ─────────────────────────────────────────────

  async findAll(organizationId: string) {
    return this.prisma.document.findMany({
      where: { organizationId },
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
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
    });
  }

  async findOne(id: string, organizationId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });
    if (!document || document.organizationId !== organizationId) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }
    return document;
  }

  async findOnePublic(
    id: string,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const document = await this.findOne(id, organizationId);

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

  async getDownloadUrl(id: string, organizationId: string) {
    const document = await this.findOne(id, organizationId);

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

  async retryProcessing(id: string, organizationId: string) {
    const document = await this.findOne(id, organizationId);

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
      organizationId,
    });

    return { message: 'Document requeued' };
  }

  async updateFilename(
    id: string,
    newFilename: string,
    organizationId: string,
  ) {
    let sanitized = newFilename
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, '-')
      .replace(/-+/g, '-');
    if (!sanitized.endsWith('.pdf')) {
      sanitized += '.pdf';
    }

    await this.findOne(id, organizationId);

    const updated = await this.prisma.document.update({
      where: { id },
      data: { finalName: sanitized },
    });

    return updated;
  }

  async remove(id: string, organizationId: string) {
    const document = await this.findOne(id, organizationId);

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

  async cancel(id: string, organizationId: string) {
    const document = await this.findOne(id, organizationId);

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

  // ─── Admin / internal helpers (not organization-scoped) ───────────────────────

  async findStuck(): Promise<{
    stuckDocumentsCount: number;
    stuckDocuments: {
      id: string;
      originalName: string;
      status: DocumentStatus;
      updatedAt: Date;
      createdAt: Date;
      reason: string;
    }[];
  }> {
    const docs = await this.prisma.document.findMany({
      where: {
        status: {
          in: [
            DocumentStatus.QUEUED,
            DocumentStatus.EXTRACTING_TEXT,
            DocumentStatus.ANALYZING_WITH_AI,
            DocumentStatus.RENAMING,
          ],
        },
      },
      select: {
        id: true,
        originalName: true,
        status: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    const activeJobs = await this.documentQueue.getActive();
    const waitingJobs = await this.documentQueue.getWaiting();

    const queueDocIds = new Set<string>();
    const checkJobs = [...activeJobs, ...waitingJobs];
    for (const job of checkJobs) {
      const data = job.data as { documentId?: string } | undefined;
      if (data?.documentId) {
        queueDocIds.add(data.documentId);
      }
    }

    const stuckDocs: {
      id: string;
      originalName: string;
      status: DocumentStatus;
      updatedAt: Date;
      createdAt: Date;
      reason: string;
    }[] = [];
    const now = Date.now();
    const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

    for (const doc of docs) {
      const isRegisteredInQueue = queueDocIds.has(doc.id);
      const docAgeMs = now - doc.updatedAt.getTime();

      let stuckReason: string | null = null;

      if (!isRegisteredInQueue) {
        if (doc.status === DocumentStatus.QUEUED) {
          stuckReason =
            'Document is QUEUED in database but missing from active/waiting/stalled queue jobs.';
        } else {
          stuckReason = `Document status is '${doc.status}' in database but no matching active/waiting/stalled job found in BullMQ.`;
        }
      } else if (
        doc.status !== DocumentStatus.QUEUED &&
        docAgeMs > TIMEOUT_MS
      ) {
        stuckReason = `Processing active in database for more than 15 minutes (${Math.round(docAgeMs / 60000)} mins since last update).`;
      }

      if (stuckReason) {
        stuckDocs.push({
          id: doc.id,
          originalName: doc.originalName,
          status: doc.status,
          updatedAt: doc.updatedAt,
          createdAt: doc.createdAt,
          reason: stuckReason,
        });
      }
    }

    return {
      stuckDocumentsCount: stuckDocs.length,
      stuckDocuments: stuckDocs,
    };
  }

  async reconcileStuck(): Promise<{
    message: string;
    reconciledCount: number;
    reconciledIds: string[];
  }> {
    const { stuckDocuments } = await this.findStuck();

    if (stuckDocuments.length === 0) {
      return {
        message: 'No stuck documents detected.',
        reconciledCount: 0,
        reconciledIds: [],
      };
    }

    const reconciledIds: string[] = [];

    for (const doc of stuckDocuments) {
      await this.prisma.document.update({
        where: { id: doc.id },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage: `System auto-reconciliation: detected stuck processing. Reason: ${doc.reason}`,
        },
      });
      reconciledIds.push(doc.id);
      this.logger.warn(
        `Auto-reconciled stuck document ${doc.id} (${doc.originalName}) to FAILED.`,
      );
    }

    return {
      message: `Successfully reconciled ${reconciledIds.length} stuck documents to FAILED.`,
      reconciledCount: reconciledIds.length,
      reconciledIds,
    };
  }
}
