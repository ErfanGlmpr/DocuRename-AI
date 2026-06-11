import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const MOCK_USER = {
  id: 'user-1',
  email: 'test@example.com',
  organizationId: 'org-1',
  role: 'OWNER' as const,
};

describe('DocumentsController (Unit - Stuck Detection)', () => {
  let controller: DocumentsController;

  const mockDocumentsService = {
    findAll: jest.fn(),
    findOnePublic: jest.fn(),
    getDownloadUrl: jest.fn(),
    retryProcessing: jest.fn(),
    updateFilename: jest.fn(),
    remove: jest.fn(),
    cancel: jest.fn(),
    findStuck: jest.fn(),
    reconcileStuck: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: mockDocumentsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocumentsController>(DocumentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET stuck', () => {
    it('should return a list of stuck documents', async () => {
      const mockResult = {
        stuckDocumentsCount: 1,
        stuckDocuments: [
          {
            id: 'stuck-doc-id',
            originalName: 'test.pdf',
            status: 'QUEUED',
            reason: 'Missing from queue',
          },
        ],
      };

      mockDocumentsService.findStuck.mockResolvedValue(mockResult);

      const result = await controller.findStuck(MOCK_USER);

      expect(result).toEqual(mockResult);
      expect(mockDocumentsService.findStuck).toHaveBeenCalledWith(
        MOCK_USER.organizationId,
      );
    });
  });

  describe('POST stuck/reconcile', () => {
    it('should trigger reconciliation and return results', async () => {
      const mockResult = {
        message: 'Successfully reconciled 1 stuck documents.',
        reconciledCount: 1,
        reconciledIds: ['stuck-doc-id'],
      };

      mockDocumentsService.reconcileStuck.mockResolvedValue(mockResult);

      const result = await controller.reconcileStuck(MOCK_USER);

      expect(result).toEqual(mockResult);
      expect(mockDocumentsService.reconcileStuck).toHaveBeenCalledWith(
        MOCK_USER.organizationId,
      );
    });
  });

  describe('GET /', () => {
    it('should call findAll with the user organizationId', async () => {
      mockDocumentsService.findAll.mockResolvedValue([]);

      await controller.findAll(MOCK_USER);

      expect(mockDocumentsService.findAll).toHaveBeenCalledWith('org-1');
    });
  });

  describe('GET /:id', () => {
    it('should pass organizationId to findOnePublic', async () => {
      mockDocumentsService.findOnePublic.mockResolvedValue({});
      await controller.findOne('doc-1', MOCK_USER);
      expect(mockDocumentsService.findOnePublic).toHaveBeenCalledWith(
        'doc-1',
        'org-1',
      );
    });
  });

  describe('GET /:id/download', () => {
    it('should pass organizationId to getDownloadUrl', async () => {
      mockDocumentsService.getDownloadUrl.mockResolvedValue({
        url: 'http://test',
      });
      await controller.getDownloadUrl('doc-1', MOCK_USER);
      expect(mockDocumentsService.getDownloadUrl).toHaveBeenCalledWith(
        'doc-1',
        'org-1',
      );
    });
  });

  describe('POST /:id/retry', () => {
    it('should pass organizationId to retryProcessing', async () => {
      mockDocumentsService.retryProcessing.mockResolvedValue({ message: 'ok' });
      await controller.retryProcessing('doc-1', MOCK_USER);
      expect(mockDocumentsService.retryProcessing).toHaveBeenCalledWith(
        'doc-1',
        'org-1',
      );
    });
  });

  describe('POST /:id/cancel', () => {
    it('should pass organizationId to cancel', async () => {
      mockDocumentsService.cancel.mockResolvedValue({ message: 'ok' });
      await controller.cancel('doc-1', MOCK_USER);
      expect(mockDocumentsService.cancel).toHaveBeenCalledWith(
        'doc-1',
        'org-1',
      );
    });
  });
});
