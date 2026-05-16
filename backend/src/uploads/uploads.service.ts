import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue('document-processing') private documentQueue: Queue,
  ) {}

  async processUploads(files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const createdDocuments = [];

    for (const file of files) {
      if (file.mimetype !== 'application/pdf') {
        this.logger.warn(`Skipping non-PDF file: ${file.originalname}`);
        continue;
      }

      const hash = crypto
        .createHash('sha256')
        .update(file.buffer)
        .digest('hex');
      const documentId = uuidv4();
      const storageKey = `documents/${documentId}/original.pdf`;

      // Upload to MinIO
      await this.storage.uploadBuffer(storageKey, file.buffer, file.mimetype);

      // Create record
      const document = await this.prisma.document.create({
        data: {
          id: documentId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          sha256: hash,
          storageKey,
          status: DocumentStatus.QUEUED,
        },
      });

      // Enqueue processing
      await this.documentQueue.add('process-pdf', {
        documentId: document.id,
      });

      createdDocuments.push({
        id: document.id,
        originalName: document.originalName,
        status: document.status,
      });
    }

    return { documents: createdDocuments };
  }
}
