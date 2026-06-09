import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
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
// Phase 4
import { VirusScanService } from '../../security/virus-scan.service';
import { DocumentChunkingService } from '../document-chunking/document-chunking.service';
import { DocumentQualityService } from '../document-quality/document-quality.service';
import { DocumentEventsService, DocumentEventType } from '../../events/document-events.service';
import { MetricsService } from '../../observability/metrics.service';
import { RetryPolicyService } from '../../queue/retry-policy.service';

@Processor('document-processing')
export class DocumentProcessorService extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessorService.name);
  private readonly processingTimeoutMs: number;

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
    // Phase 4
    private readonly virusScanService: VirusScanService,
    private readonly documentChunkingService: DocumentChunkingService,
    private readonly documentQualityService: DocumentQualityService,
    private readonly eventsService: DocumentEventsService,
    private readonly metricsService: MetricsService,
    private readonly retryPolicyService: RetryPolicyService,
  ) {
    super();
    this.processingTimeoutMs = parseInt(
      this.configService.get<string>('DOCUMENT_PROCESSING_TIMEOUT_MS') ||
        '900000',
      10,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BullMQ entry point — wraps processDocument with a timeout guard
  // ─────────────────────────────────────────────────────────────────────────

  async process(job: Job<{ documentId: string; organizationId?: string }>): Promise<void> {
    const { documentId, organizationId } = job.data;
    const startTime = Date.now();

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('DOCUMENT_TIMEOUT'));
      }, this.processingTimeoutMs);
    });

    try {
      await Promise.race([
        this.processDocument(documentId, organizationId, startTime),
        timeoutPromise,
      ]);
    } catch (error: unknown) {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const isTimeout = (error as Error).message === 'DOCUMENT_TIMEOUT';
      if (isTimeout) {
        this.logger.warn(`Processing timeout for document ${documentId}`);
        this.cancellationService.cancel(documentId);
        await this.auditService.log({ documentId, action: 'DOCUMENT_TIMEOUT' });
        await this.safeMarkFailed(documentId, 'Processing timeout exceeded');
        this.emitEvent(documentId, organizationId,  'DOCUMENT_FAILED', {
            reason: 'timeout',
          });
        this.metricsService.documentsFailedTotal.inc();
        throw new UnrecoverableError('Processing timeout exceeded');
      }

      // Let BullMQ handle the re-throw; retry decision is made in processDocument
      throw error;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core processing pipeline
  // ─────────────────────────────────────────────────────────────────────────

  private async processDocument(
    documentId: string,
    organizationId: string | undefined,
    startTime: number,
  ): Promise<void> {
    this.logger.log(`Starting processing for document ${documentId}`);
    const signal = this.cancellationService.register(documentId);

    try {
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });
      if (!document) {
        this.logger.error(`Document ${documentId} not found`);
        throw new UnrecoverableError(`Document ${documentId} not found`);
      }

      this.eventsService.emit(
        this.eventsService.buildEvent(
          documentId,
          'DOCUMENT_PROCESSING_STARTED',
        ),
      );

      // ── Step 1: Virus Scan ──────────────────────────────────────────────
      const fileBuffer = await this.storage.getObject(document.storageKey);

      if (this.virusScanService.isEnabled()) {
        await this.updateStatus(documentId, DocumentStatus.VIRUS_SCANNING);
        this.eventsService.emit(
          this.eventsService.buildEvent(
            documentId,
            'DOCUMENT_VIRUS_SCAN_STARTED',
          ),
        );
        await this.auditService.log({
          documentId,
          action: 'DOCUMENT_VIRUS_SCAN_STARTED',
        });

        this.metricsService.virusScanTotal.inc();
        const scanResult = await this.virusScanService.scan(fileBuffer);

        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            virusScanned: !scanResult.skipped,
            virusScanResult: scanResult.virusScanResult,
          },
        });

        if (!scanResult.clean) {
          // Infected — permanently fail without retry
          this.metricsService.virusScanFailedTotal.inc();
          await this.auditService.log({
            documentId,
            action: 'DOCUMENT_INFECTED',
            metadata: { virusScanResult: scanResult.virusScanResult },
          });
          this.emitEvent(documentId, organizationId,  'DOCUMENT_INFECTED');
          await this.prisma.document.update({
            where: { id: documentId },
            data: {
              status: DocumentStatus.INFECTED,
              errorMessage: `Infected: ${scanResult.virusScanResult}`,
            },
          });
          this.metricsService.documentsFailedTotal.inc();
          throw new UnrecoverableError(
            `Document infected: ${scanResult.virusScanResult}`,
          );
        }

        await this.auditService.log({
          documentId,
          action: 'DOCUMENT_VIRUS_SCAN_PASSED',
        });
        this.eventsService.emit(
          this.eventsService.buildEvent(
            documentId,
            'DOCUMENT_VIRUS_SCAN_PASSED',
          ),
        );
      }

      if (signal.aborted) throw new Error('AbortError');

      // ── Step 2: Extract Text ────────────────────────────────────────────
      await this.updateStatus(documentId, DocumentStatus.EXTRACTING_TEXT);

      let extractedText = '';
      let pageCount = 0;
      let ocrUsed = false;
      let ocrTextLength: number | undefined;

      try {
        if (this.eventsService) {
          // Emit OCR_STARTED before extraction so the client knows it may take time
        }
        const result = await this.pdfExtraction.extractText(fileBuffer);
        extractedText = result.text;
        pageCount = result.pageCount;
        ocrUsed = result.ocrUsed;
        ocrTextLength = result.ocrTextLength;

        if (ocrUsed) {
          this.metricsService.ocrRunsTotal.inc();
          this.metricsService.ocrSuccessTotal.inc();
          this.eventsService.emit(
            this.eventsService.buildEvent(
              documentId,
              'DOCUMENT_OCR_COMPLETED',
              {
                ocrTextLength: ocrTextLength ?? 0,
              },
            ),
          );
        }

        await this.prisma.document.update({
          where: { id: documentId },
          data: { pageCount, ocrUsed, ocrTextLength: ocrTextLength ?? null },
        });
      } catch (e: unknown) {
        throw new Error(
          (e as Error).message || 'Failed to extract text from PDF.',
        );
      }

      if (signal.aborted) throw new Error('AbortError');

      await this.auditService.log({
        documentId,
        action: 'DOCUMENT_TEXT_EXTRACTED',
        metadata: {
          extractedTextLength: extractedText.length,
          ocrUsed,
          pageCount,
        },
      });
      this.emitEvent(documentId, organizationId,  'DOCUMENT_TEXT_EXTRACTED', {
          ocrUsed,
          pageCount,
        });

      // ── Step 3: PII Detection & Redaction ──────────────────────────────
      let aiInputText: string;
      let aiInputMode: AiInputMode;

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
          this.emitEvent(documentId, organizationId,  'DOCUMENT_PII_DETECTED', {
              piiEntityCount: entities.length,
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

          // ── Step 4: Chunking / prompt minimization ──────────────────────
          const chunkResult = this.documentChunkingService.chunk(
            redaction.redactedText,
          );

          if (!chunkResult.selectedText.trim()) {
            throw new Error(
              'No usable text remained after privacy processing.',
            );
          }

          aiInputText = chunkResult.selectedText;
          aiInputMode = AiInputMode.MINIMIZED_REDACTED_TEXT;

          await this.prisma.document.update({
            where: { id: documentId },
            data: {
              chunkCount: chunkResult.chunkCount,
              inputTextLength: chunkResult.inputTextLength,
            },
          });

          await this.auditService.log({
            documentId,
            action: 'DOCUMENT_AI_INPUT_MINIMIZED',
            metadata: {
              originalLength: chunkResult.inputTextLength,
              minimizedLength: chunkResult.selectedText.length,
              wasChunked: chunkResult.wasChunked,
              chunkCount: chunkResult.chunkCount,
            },
          });
        } catch (error: unknown) {
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
        const chunkResult = this.documentChunkingService.chunk(extractedText);
        aiInputText = chunkResult.selectedText;
        aiInputMode = AiInputMode.RAW_TEXT;

        await this.documentsService.updatePrivacyFields(documentId, {
          privacyMode: PrivacyMode.NONE,
          aiInputMode: AiInputMode.RAW_TEXT,
        });

        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            chunkCount: chunkResult.chunkCount,
            inputTextLength: chunkResult.inputTextLength,
          },
        });
      }

      // ── Step 5: AI Analysis ─────────────────────────────────────────────
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
      this.emitEvent(documentId, organizationId,  'DOCUMENT_AI_STARTED', {
          provider: aiProvider.name,
        });
      this.metricsService.providerRequestsTotal.inc({
        provider: aiProvider.name,
      });

      let metadata: Awaited<
        ReturnType<typeof aiProvider.extractDocumentMetadata>
      >['metadata'];
      let tokenUsage: Awaited<
        ReturnType<typeof aiProvider.extractDocumentMetadata>
      >['tokenUsage'];
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
        this.metricsService.aiLatencySeconds.observe(
          { provider: aiProvider.name },
          aiDurationMs / 1000,
        );
      } catch (error: unknown) {
        const err = error as Error;
        if (err.name === 'AbortError' || err.message === 'AbortError')
          throw error;

        this.metricsService.providerFailuresTotal.inc({
          provider: aiProvider.name,
        });

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

          this.metricsService.providerRequestsTotal.inc({
            provider: fallback.name,
          });
          const result = await aiProvider.extractDocumentMetadata(
            { text: aiInputText, originalFilename: document.originalName },
            signal,
          );
          metadata = result.metadata;
          tokenUsage = result.tokenUsage;
          aiDurationMs = Date.now() - aiStartTime;
          this.metricsService.aiLatencySeconds.observe(
            { provider: fallback.name },
            aiDurationMs / 1000,
          );
        } else {
          // No fallback — let RetryPolicy decide
          this.retryPolicyService.throwIfNonRetryable(error);
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
      this.emitEvent(documentId, organizationId,  'DOCUMENT_AI_COMPLETED', {
          confidence: metadata.confidence ?? 0,
        });

      // ── Step 6: Quality Score ───────────────────────────────────────────
      const qualityScore = this.documentQualityService.calculate({
        pageCount,
        extractedTextLength: extractedText.length,
        ocrUsed,
        aiConfidence: metadata.confidence,
        title: metadata.title,
        category: metadata.category,
        documentDate: metadata.documentDate,
        issuer: metadata.issuer,
        recipient: metadata.recipient,
        referenceNumber: metadata.referenceNumber,
        summary: metadata.summary,
      });

      // ── Step 7: Renaming ────────────────────────────────────────────────
      await this.updateStatus(documentId, DocumentStatus.RENAMING);
      const generatedName =
        this.filenameGenerator.generateSafeFilename(metadata);
      const finalStorageKey = `documents/${documentId}/final/${generatedName}`;
      await this.storage.copyObject(document.storageKey, finalStorageKey);

      // ── Step 8: Completed / Needs Review ────────────────────────────────
      const reviewThreshold = parseFloat(
        this.configService.get('AI_CONFIDENCE_REVIEW_THRESHOLD') || '0.7',
      );
      const nextStatus =
        metadata.confidence && metadata.confidence < reviewThreshold
          ? DocumentStatus.NEEDS_REVIEW
          : DocumentStatus.COMPLETED;

      const processingDurationMs = Date.now() - startTime;

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
          processingDuration: Math.round(processingDurationMs / 1000),
          processingDurationMs,
          promptTokens: tokenUsage?.promptTokens,
          completionTokens: tokenUsage?.completionTokens,
          totalTokens: tokenUsage?.totalTokens,
          qualityScore,
        },
      });

      this.metricsService.documentsProcessedTotal.inc();
      this.metricsService.documentProcessingDurationSeconds.observe(
        processingDurationMs / 1000,
      );

      this.emitEvent(documentId, organizationId,  'DOCUMENT_COMPLETED', {
          qualityScore,
          confidence: metadata.confidence ?? 0,
        });

      this.logger.log(
        `Successfully processed document ${documentId} (quality: ${qualityScore}, ${processingDurationMs} ms)`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      const isAbort = err.message === 'AbortError' || err.name === 'AbortError';
      const isUnrecoverable = error instanceof UnrecoverableError;

      if (isAbort) {
        this.logger.warn(`Processing aborted for document ${documentId}`);
        await this.safeMarkFailed(documentId, 'Stopped by user');
        this.emitEvent(documentId, organizationId,  'DOCUMENT_FAILED', {
            reason: 'cancelled',
          });
        this.metricsService.documentsFailedTotal.inc();
        return;
      }

      this.logger.error(
        `Processing failed for document ${documentId}`,
        err.message,
      );
      await this.safeMarkFailed(
        documentId,
        sanitizeAiError(error) || 'Unknown processing error',
      );
      this.emitEvent(documentId, organizationId,  'DOCUMENT_FAILED');
      this.metricsService.documentsFailedTotal.inc();

      if (isUnrecoverable) throw error; // already an UnrecoverableError, re-throw as-is

      // Check retry policy for non-unrecoverable errors
      this.retryPolicyService.throwIfNonRetryable(error);
      throw error;
    } finally {
      this.cancellationService.unregister(documentId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async updateStatus(
    id: string,
    status: DocumentStatus,
  ): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      select: { status: true },
    });
    const terminalStatuses: DocumentStatus[] = [
      DocumentStatus.FAILED,
      DocumentStatus.COMPLETED,
      DocumentStatus.INFECTED,
    ];
    if (doc && terminalStatuses.includes(doc.status)) {
      this.logger.warn(
        `Skipping status update to ${status} for document ${id} — already in terminal state ${doc.status}`,
      );
      return;
    }
    await this.prisma.document.update({ where: { id }, data: { status } });
  }

  /**
   * Marks a document as FAILED only if it is not already in a terminal state.
   * Prevents overwriting INFECTED or COMPLETED statuses in race conditions.
   */
  private async safeMarkFailed(
    documentId: string,
    errorMessage: string,
  ): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { status: true },
    });
    const terminalStatuses: DocumentStatus[] = [
      DocumentStatus.COMPLETED,
      DocumentStatus.INFECTED,
      DocumentStatus.NEEDS_REVIEW,
    ];
    if (doc && terminalStatuses.includes(doc.status)) {
      return; // already done, don't overwrite
    }
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.FAILED, errorMessage },
    });
  }

  private emitEvent(documentId: string, orgId: string | undefined, status: DocumentEventType, meta?: Record<string, any>) {
    this.eventsService.emit(this.eventsService.buildEvent(documentId, status, meta, orgId));
  }
}
