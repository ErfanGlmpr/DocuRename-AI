import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AiProviderFactory } from '../ai/ai.factory';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';

describe('HealthService', () => {
  let service: HealthService;

  const mockPrisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  const mockStorage = {
    healthCheck: jest.fn().mockResolvedValue(undefined),
  };

  const mockAiProvider = {
    name: 'test-provider',
    model: 'test-model',
    healthCheck: jest.fn().mockResolvedValue(true),
  };

  const mockAiFactory = {
    getProvider: jest.fn().mockReturnValue(mockAiProvider),
  };

  const mockQueue = {
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: AiProviderFactory, useValue: mockAiFactory },
        { provide: getQueueToken('document-processing'), useValue: mockQueue },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'REDIS_HOST') return 'localhost';
              if (key === 'REDIS_PORT') return '6379';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('liveness', () => {
    it('reports database and redis status', async () => {
      const result = await service.liveness();
      expect(result).toHaveProperty('database');
      expect(result).toHaveProperty('redis');
      expect(result.database).toMatch(/up|down/);
    });
  });

  describe('detailed', () => {
    it('returns a report with all five checks', async () => {
      const report = await service.detailed();
      expect(report).toHaveProperty('checks');
      expect(report.checks).toHaveProperty('database');
      expect(report.checks).toHaveProperty('redis');
      expect(report.checks).toHaveProperty('storage');
      expect(report.checks).toHaveProperty('aiProvider');
      expect(report.checks).toHaveProperty('queue');
    });

    it('marks storage as up when healthCheck resolves', async () => {
      mockStorage.healthCheck.mockResolvedValueOnce(undefined);
      const report = await service.detailed();
      expect(report.checks.storage.status).toBe('up');
    });

    it('marks storage as down when healthCheck rejects', async () => {
      mockStorage.healthCheck.mockRejectedValueOnce(
        new Error('S3 unreachable'),
      );
      const report = await service.detailed();
      expect(report.checks.storage.status).toBe('down');
    });

    it('marks AI provider as up when healthCheck returns true', async () => {
      mockAiProvider.healthCheck.mockResolvedValueOnce({
        ok: true,
        provider: 'test',
        model: 'test',
      });
      const report = await service.detailed();
      expect(report.checks.aiProvider.status).toBe('up');
    });
  });
});
