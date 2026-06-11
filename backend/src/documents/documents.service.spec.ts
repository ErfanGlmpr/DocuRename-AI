import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CancellationService } from '../cancellation/cancellation.service';
import { getQueueToken } from '@nestjs/bullmq';
import { DocumentStatus } from '@prisma/client';

const ORG_ID = 'org-1';

describe('DocumentsService (Unit - Stuck Detection)', () => {
  let service: DocumentsService;
  let mockQueue: {
    getActive: jest.Mock;
    getWaiting: jest.Mock;
  };

  const mockPrisma = {
    document: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockStorage = {};
  const mockCancellation = {};

  beforeEach(async () => {
    mockQueue = {
      getActive: jest.fn(),
      getWaiting: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: CancellationService, useValue: mockCancellation },
        { provide: getQueueToken('document-processing'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findStuck', () => {
    it('should return empty list when no in-progress documents exist', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getWaiting.mockResolvedValue([]);

      const result = await service.findStuck(ORG_ID);

      expect(result.stuckDocumentsCount).toBe(0);
      expect(result.stuckDocuments).toEqual([]);
      expect(mockPrisma.document.findMany).toHaveBeenCalled();
      const mockCalls = mockPrisma.document.findMany.mock.calls as unknown[][];
      const findManyArg = mockCalls[0][0] as {
        where: { organizationId: string };
      };
      expect(findManyArg.where.organizationId).toBe(ORG_ID);
    });

    it('should detect stuck QUEUED document missing from physical queue', async () => {
      const mockDoc = {
        id: 'stuck-queued-id',
        originalName: 'stuck.pdf',
        status: DocumentStatus.QUEUED,
        updatedAt: new Date(),
        createdAt: new Date(),
      };

      mockPrisma.document.findMany.mockResolvedValue([mockDoc]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getWaiting.mockResolvedValue([]);

      const result = await service.findStuck(ORG_ID);

      expect(result.stuckDocumentsCount).toBe(1);
      expect(result.stuckDocuments[0].id).toBe(mockDoc.id);
      expect(result.stuckDocuments[0].reason).toContain(
        'QUEUED in database but missing',
      );
    });

    it('should not mark QUEUED document as stuck if it is in the queue', async () => {
      const mockDoc = {
        id: 'active-queued-id',
        originalName: 'active.pdf',
        status: DocumentStatus.QUEUED,
        updatedAt: new Date(),
        createdAt: new Date(),
      };

      mockPrisma.document.findMany.mockResolvedValue([mockDoc]);
      mockQueue.getActive.mockResolvedValue([
        { data: { documentId: 'active-queued-id' } },
      ]);
      mockQueue.getWaiting.mockResolvedValue([]);

      const result = await service.findStuck(ORG_ID);

      expect(result.stuckDocumentsCount).toBe(0);
      expect(result.stuckDocuments).toEqual([]);
    });

    it('should detect chronically stuck documents based on 15 minute threshold', async () => {
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
      const mockDoc = {
        id: 'chronically-stuck-id',
        originalName: 'stuck-ai.pdf',
        status: DocumentStatus.ANALYZING_WITH_AI,
        updatedAt: twentyMinsAgo,
        createdAt: twentyMinsAgo,
      };

      mockPrisma.document.findMany.mockResolvedValue([mockDoc]);
      mockQueue.getActive.mockResolvedValue([
        { data: { documentId: 'chronically-stuck-id' } },
      ]);
      mockQueue.getWaiting.mockResolvedValue([]);

      const result = await service.findStuck(ORG_ID);

      expect(result.stuckDocumentsCount).toBe(1);
      expect(result.stuckDocuments[0].id).toBe(mockDoc.id);
      expect(result.stuckDocuments[0].reason).toContain(
        'Processing active in database for more than 15 minutes',
      );
    });
  });

  describe('reconcileStuck', () => {
    it('should update detected stuck documents to FAILED in the database', async () => {
      const mockDoc = {
        id: 'stuck-id',
        originalName: 'stuck.pdf',
        status: DocumentStatus.EXTRACTING_TEXT,
        updatedAt: new Date(),
        createdAt: new Date(),
      };

      mockPrisma.document.findMany.mockResolvedValue([mockDoc]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getWaiting.mockResolvedValue([]);
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.reconcileStuck(ORG_ID);

      expect(result.reconciledCount).toBe(1);
      expect(result.reconciledIds).toEqual(['stuck-id']);
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'stuck-id' },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage:
            "System auto-reconciliation: detected stuck processing. Reason: Document status is 'EXTRACTING_TEXT' in database but no matching active/waiting/stalled job found in BullMQ.",
        },
      });
    });

    it('should do nothing if no stuck documents are detected', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getWaiting.mockResolvedValue([]);

      const result = await service.reconcileStuck(ORG_ID);

      expect(result.reconciledCount).toBe(0);
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll (org-scoped)', () => {
    it('should query with organizationId filter', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_ID },
        }),
      );
    });
  });

  describe('findOne (org-scoped)', () => {
    it('should throw NotFoundException if document belongs to a different org', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        organizationId: 'other-org',
      });

      await expect(service.findOne('doc-1', ORG_ID)).rejects.toThrow(
        'Document with id doc-1 not found',
      );
    });

    it('should return document when org matches', async () => {
      const doc = { id: 'doc-1', organizationId: ORG_ID };
      mockPrisma.document.findUnique.mockResolvedValue(doc);

      const result = await service.findOne('doc-1', ORG_ID);

      expect(result).toEqual(doc);
    });
  });
});
