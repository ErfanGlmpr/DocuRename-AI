import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStatus } from '@prisma/client';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    prisma = {
      document: {
        groupBy: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOverview', () => {
    it('should aggregate document stats for the organization', async () => {
      // Mock groupBy for status
      (prisma.document.groupBy as jest.Mock).mockResolvedValueOnce([
        { status: DocumentStatus.COMPLETED, _count: { _all: 10 } },
        { status: DocumentStatus.FAILED, _count: { _all: 2 } },
        { status: DocumentStatus.QUEUED, _count: { _all: 5 } },
      ]);

      // Mock aggregate for duration
      (prisma.document.aggregate as jest.Mock).mockResolvedValueOnce({
        _avg: { processingDurationMs: 1500 },
      });

      // Mock groupBy for provider
      (prisma.document.groupBy as jest.Mock).mockResolvedValueOnce([
        { aiProvider: 'openai', _count: { _all: 8 } },
        { aiProvider: 'gemini', _count: { _all: 4 } },
      ]);

      // Mock count for OCR
      (prisma.document.count as jest.Mock).mockResolvedValueOnce(3);

      // Mock count for virus
      (prisma.document.count as jest.Mock).mockResolvedValueOnce(1);

      const result = await service.getOverview('org-1');

      expect(result).toEqual({
        documentCountsByStatus: {
          COMPLETED: 10,
          FAILED: 2,
          QUEUED: 5,
        },
        failedDocumentCount: 2,
        processingDocumentCount: 5,
        averageProcessingDuration: 1500,
        providerUsageCounts: {
          openai: 8,
          gemini: 4,
        },
        ocrUsageCount: 3,
        virusScanFailures: 1,
      });

      expect(prisma.document.groupBy).toHaveBeenCalledTimes(2);
      expect(prisma.document.aggregate).toHaveBeenCalledTimes(1);
      expect(prisma.document.count).toHaveBeenCalledTimes(2);
    });
  });
});
