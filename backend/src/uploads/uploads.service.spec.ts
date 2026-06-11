import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { DocumentStatus, OrganizationRole } from '@prisma/client';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

describe('UploadsService', () => {
  let service: UploadsService;
  let prismaService: PrismaService;
  let storageService: StorageService;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        {
          provide: PrismaService,
          useValue: {
            document: {
              create: jest.fn().mockResolvedValue({
                id: 'doc-id',
                status: DocumentStatus.QUEUED,
                originalName: 'valid.pdf',
                organizationId: 'org-id',
              }),
            },
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadBuffer: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getQueueToken('document-processing'),
          useValue: {
            add: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
    prismaService = module.get<PrismaService>(PrismaService);
    storageService = module.get<StorageService>(StorageService);
    queue = module.get(getQueueToken('document-processing'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processUploads', () => {
    const mockUser = {
      id: 'user-id',
      email: 'user@example.com',
      role: OrganizationRole.MEMBER,
      organizationId: 'org-id',
    };

    it('throws BadRequestException if an invalid file reaches the service', async () => {
      const files = [
        {
          originalname: 'invalid.txt',
          mimetype: 'text/plain',
          size: 100,
          buffer: Buffer.from('test'),
        } as Express.Multer.File,
      ];

      await expect(service.processUploads(files, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.processUploads(files, mockUser)).rejects.toThrow(
        'Upload validation failed',
      );
    });

    it('does not enqueue or store invalid files', async () => {
      const files = [
        {
          originalname: 'invalid.txt',
          mimetype: 'text/plain',
          size: 100,
          buffer: Buffer.from('test'),
        } as Express.Multer.File,
      ];

      try {
        await service.processUploads(files, mockUser);
      } catch {
        // Expected
      }

      expect(storageService.uploadBuffer).not.toHaveBeenCalled();
      expect(prismaService.document.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('processes valid files normally', async () => {
      const files = [
        {
          originalname: 'valid.pdf',
          mimetype: 'application/pdf',
          size: 100,
          buffer: Buffer.from('test'),
        } as Express.Multer.File,
      ];

      const result = await service.processUploads(files, mockUser);

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].originalName).toBe('valid.pdf');
      expect(storageService.uploadBuffer).toHaveBeenCalledTimes(1);
      expect(prismaService.document.create).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });
});
