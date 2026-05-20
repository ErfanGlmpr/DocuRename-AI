import { AiEvaluationService } from './ai-evaluation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderFactory } from '../ai/ai.factory';
import { PromptMinimizationService } from '../processing/prompt-minimization/prompt-minimization.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';

describe('AiEvaluationService', () => {
  let service: AiEvaluationService;
  let mockPrisma: {
    document: { findUnique: jest.Mock };
    aiEvaluationRun: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let mockFactory: {
    isValidProvider: jest.Mock;
    getSupportedProviders: jest.Mock;
    getProviderByName: jest.Mock;
  };
  let mockPromptMinimization: {
    minimize: jest.Mock;
  };
  let mockAudit: {
    log: jest.Mock;
  };
  let mockConfig: {
    get: jest.Mock;
  };
  let mockAiProvider: {
    model: string;
    extractDocumentMetadata: jest.Mock;
  };

  beforeEach(() => {
    mockPrisma = {
      document: { findUnique: jest.fn() },
      aiEvaluationRun: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    mockAiProvider = {
      model: 'default-model',
      extractDocumentMetadata: jest.fn().mockResolvedValue({
        metadata: { title: 'AI Eval', confidence: 0.9 },
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    };

    mockFactory = {
      isValidProvider: jest.fn().mockReturnValue(true),
      getSupportedProviders: jest.fn().mockReturnValue(['openai', 'ollama']),
      getProviderByName: jest.fn().mockReturnValue(mockAiProvider),
    };

    mockPromptMinimization = {
      minimize: jest.fn().mockReturnValue({ minimizedText: 'minimized-text' }),
    };

    mockAudit = { log: jest.fn() };

    mockConfig = {
      get: jest.fn().mockReturnValue('true'), // PII_REDACTION_ENABLED = true
    };

    service = new AiEvaluationService(
      mockPrisma as unknown as PrismaService,
      mockFactory as unknown as AiProviderFactory,
      mockPromptMinimization as unknown as PromptMinimizationService,
      mockAudit as unknown as AuditService,
      mockConfig as unknown as ConfigService,
    );
  });

  describe('runEvaluation', () => {
    it('should use redactedText when privacy is enabled', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        originalName: 'test.pdf',
        redactedText: 'safe-text',
      });
      mockPrisma.aiEvaluationRun.create.mockResolvedValue({ id: 'run-1' });
      mockPrisma.aiEvaluationRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'COMPLETED',
      });

      await service.runEvaluation('doc-1', 'openai');

      expect(mockPromptMinimization.minimize).toHaveBeenCalledWith('safe-text');
      expect(mockAiProvider.extractDocumentMetadata).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'minimized-text' }),
      );
      expect(mockPrisma.aiEvaluationRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }) as unknown,
        }),
      );
    });

    it('should throw if no redacted text is available and privacy is enabled for cloud provider', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        originalName: 'test.pdf',
        redactedText: null, // missing!
      });

      await expect(service.runEvaluation('doc-1', 'openai')).rejects.toThrow(
        /no redacted text available/,
      );
    });

    it('should save failed runs without throwing', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        originalName: 'test.pdf',
        redactedText: 'safe-text',
      });
      mockPrisma.aiEvaluationRun.create.mockResolvedValue({ id: 'run-1' });

      mockAiProvider.extractDocumentMetadata.mockRejectedValue(
        new Error('Cloud error'),
      );

      await service.runEvaluation('doc-1', 'openai');

      expect(mockPrisma.aiEvaluationRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }) as unknown,
        }),
      );
    });
  });
});
