import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentStatus } from '@prisma/client';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue('document-processing') private documentQueue: Queue,
  ) {}

  async findAll() {
    return this.prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        finalName: true,
        generatedName: true,
        status: true,
        category: true,
        confidence: true,
        createdAt: true,
        errorMessage: true,
      },
    });
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }
    return document;
  }

  async getDownloadUrl(id: string) {
    const document = await this.findOne(id);
    
    if (document.status !== DocumentStatus.COMPLETED && document.status !== DocumentStatus.NEEDS_REVIEW) {
      throw new BadRequestException('Document processing is not completed');
    }

    if (!document.finalStorageKey) {
      throw new BadRequestException('Final file not found');
    }

    const url = await this.storage.getPresignedDownloadUrl(document.finalStorageKey);
    return { url };
  }

  async retryProcessing(id: string) {
    const document = await this.findOne(id);

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
    });

    return { message: 'Document requeued' };
  }

  async updateFilename(id: string, newFilename: string) {
    let sanitized = newFilename.toLowerCase().replace(/[^a-z0-9-_.]/g, '-').replace(/-+/g, '-');
    if (!sanitized.endsWith('.pdf')) {
      sanitized += '.pdf';
    }

    const document = await this.findOne(id);

    // If it has a final storage key, we might need to rename the object in storage as well,
    // but for Phase 1, we can just update the finalName in metadata.
    // However, the spec says: "Update storage final key if necessary or at least update metadata consistently."
    // Let's just update the metadata and the finalName.

    const updated = await this.prisma.document.update({
      where: { id },
      data: { finalName: sanitized },
    });

    return updated;
  }

  async remove(id: string) {
    const document = await this.findOne(id);

    // Delete original file
    try {
      await this.storage.deleteObject(document.storageKey);
    } catch (error) {
      this.logger.warn(`Could not delete original file for document ${id}: ${error.message}`);
    }

    // Delete final file if it exists
    if (document.finalStorageKey) {
      try {
        await this.storage.deleteObject(document.finalStorageKey);
      } catch (error) {
        this.logger.warn(`Could not delete final file for document ${id}: ${error.message}`);
      }
    }

    // Delete database record
    await this.prisma.document.delete({ where: { id } });

    return { message: 'Document deleted successfully' };
  }

  async cancel(id: string) {
    const document = await this.findOne(id);

    if (
      document.status === DocumentStatus.COMPLETED ||
      document.status === DocumentStatus.FAILED ||
      document.status === DocumentStatus.NEEDS_REVIEW
    ) {
      throw new BadRequestException('Cannot cancel a finished document');
    }

    await this.prisma.document.update({
      where: { id },
      data: {
        status: DocumentStatus.FAILED,
        errorMessage: 'Canceled by user',
      },
    });

    return { message: 'Document processing canceled' };
  }
}
