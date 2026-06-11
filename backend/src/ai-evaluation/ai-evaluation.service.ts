import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderFactory } from '../ai/ai.factory';
import { PromptMinimizationService } from '../processing/prompt-minimization/prompt-minimization.service';
import { AuditService } from '../audit/audit.service';
import { AiEvaluationStatus } from '@prisma/client';
import { sanitizeAiError } from '../ai/utils/parse-ai-json';

export interface EvaluationRunSummary {
  completed: number;
  failed: number;
  runs: {
    id: string;
    provider: string;
    model: string;
    status: AiEvaluationStatus;
  }[];
}

@Injectable()
export class AiEvaluationService {
  private readonly logger = new Logger(AiEvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFactory: AiProviderFactory,
    private readonly promptMinimization: PromptMinimizationService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Run a single provider/model evaluation against an existing document.
   * Uses redactedText when privacy is enabled — never raw extracted text.
   * Does NOT overwrite the document's main metadata.
   */
  async runEvaluation(
    documentId: string,
    provider: string,
    organizationId: string,
    modelOverride?: string,
    actorUserId?: string,
  ) {
    if (!this.aiFactory.isValidProvider(provider)) {
      throw new BadRequestException(
        `Unknown provider: "${provider}". Supported: ${this.aiFactory.getSupportedProviders().join(', ')}`,
      );
    }

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    // Resolve text — privacy-safe
    const privacyEnabled =
      this.configService.get<string>('PII_REDACTION_ENABLED') !== 'false';

    let inputText: string;
    if (privacyEnabled && document.redactedText) {
      // Minimize the already-redacted text
      const minimized = this.promptMinimization.minimize(document.redactedText);
      inputText = minimized.minimizedText;
    } else if (!privacyEnabled && document.redactedText) {
      // Redacted text still exists but privacy is off — use it anyway (safer)
      const minimized = this.promptMinimization.minimize(document.redactedText);
      inputText = minimized.minimizedText;
    } else {
      // No redacted text available — this should only happen for very old records
      // or when privacy was explicitly disabled and no redactedText was stored.
      // For cloud providers when privacy is enabled, refuse to proceed without redacted text.
      if (privacyEnabled && provider !== 'ollama') {
        throw new BadRequestException(
          'Cannot run evaluation with a cloud provider: no redacted text available for this document. ' +
            'Ensure PII_REDACTION_ENABLED=true and reprocess the document.',
        );
      }
      // Local fallback only — should not reach cloud providers with raw text
      inputText = '(no text available)';
    }

    if (!inputText.trim()) {
      throw new BadRequestException('No usable text available for evaluation');
    }

    // Create the run record
    const run = await this.prisma.aiEvaluationRun.create({
      data: {
        documentId,
        provider,
        model: modelOverride || provider,
        status: AiEvaluationStatus.RUNNING,
        actorUserId,
        organizationId,
      },
    });

    await this.auditService.log({
      documentId,
      action: 'AI_EVALUATION_STARTED',
      metadata: {
        evaluationRunId: run.id,
        provider,
        model: modelOverride || provider,
      },
      actorUserId,
      organizationId,
    });

    const startTime = Date.now();

    try {
      const aiProvider = this.aiFactory.getProviderByName(provider);
      const { metadata, tokenUsage } = await aiProvider.extractDocumentMetadata(
        {
          text: inputText,
          originalFilename: document.originalName,
          modelOverride,
        },
      );

      const latencyMs = Date.now() - startTime;

      const updated = await this.prisma.aiEvaluationRun.update({
        where: { id: run.id },
        data: {
          status: AiEvaluationStatus.COMPLETED,
          model: modelOverride || aiProvider.model,
          title: metadata.title,
          category: metadata.category,
          documentDate: metadata.documentDate,
          issuer: metadata.issuer,
          recipient: metadata.recipient,
          referenceNumber: metadata.referenceNumber,
          suggestedFilename: metadata.suggestedFilename,
          confidence: metadata.confidence,
          summary: metadata.summary,
          language: metadata.language,
          promptTokens: tokenUsage?.promptTokens,
          completionTokens: tokenUsage?.completionTokens,
          totalTokens: tokenUsage?.totalTokens,
          latencyMs,
        },
      });

      await this.auditService.log({
        documentId,
        action: 'AI_EVALUATION_COMPLETED',
        metadata: {
          evaluationRunId: run.id,
          provider,
          model: modelOverride || aiProvider.model,
          confidence: metadata.confidence,
          latencyMs,
          tokenUsage,
        },
        actorUserId,
        organizationId,
      });

      return updated;
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;
      const safeError = sanitizeAiError(error);

      await this.prisma.aiEvaluationRun.update({
        where: { id: run.id },
        data: {
          status: AiEvaluationStatus.FAILED,
          errorMessage: safeError,
          latencyMs,
        },
      });

      await this.auditService.log({
        documentId,
        action: 'AI_EVALUATION_FAILED',
        metadata: {
          evaluationRunId: run.id,
          provider,
          model: modelOverride || provider,
          latencyMs,
          errorMessage: safeError,
        },
        actorUserId,
        organizationId,
      });

      this.logger.warn(
        `Evaluation failed for document ${documentId} provider=${provider}: ${safeError}`,
      );

      // Return the failed run record rather than throwing
      return this.prisma.aiEvaluationRun.findUnique({ where: { id: run.id } });
    }
  }

  /**
   * Run multiple provider/model combinations sequentially.
   * Continues on individual failures — returns a summary.
   */
  async runBatch(
    documentId: string,
    runs: { provider: string; model?: string }[],
    organizationId: string,
    actorUserId?: string,
  ): Promise<EvaluationRunSummary> {
    let completed = 0;
    let failed = 0;
    const runResults: {
      id: string;
      provider: string;
      model: string;
      status: AiEvaluationStatus;
    }[] = [];

    for (const run of runs) {
      try {
        const result = await this.runEvaluation(
          documentId,
          run.provider,
          organizationId,
          run.model,
          actorUserId,
        );
        if (result) {
          runResults.push({
            id: result.id,
            provider: result.provider,
            model: result.model,
            status: result.status,
          });
          if (result.status === AiEvaluationStatus.COMPLETED) {
            completed++;
          } else {
            failed++;
          }
        }
      } catch (error: unknown) {
        failed++;
        this.logger.warn(
          `Batch run failed for provider=${run.provider} model=${run.model}: ${sanitizeAiError(error)}`,
        );
      }
    }

    return { completed, failed, runs: runResults };
  }

  /**
   * List all evaluation runs for a document, newest first.
   */
  async listEvaluations(documentId: string, organizationId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    return this.prisma.aiEvaluationRun.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
