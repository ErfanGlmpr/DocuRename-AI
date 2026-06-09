import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RetentionPolicyService } from './retention-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly retentionPolicy: RetentionPolicyService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyCleanup() {
    if (!this.retentionPolicy.isCleanupEnabled()) {
      this.logger.debug('Maintenance cleanup is disabled.');
      return;
    }

    this.logger.log('Starting daily maintenance cleanup...');

    await this.cleanupOldEvaluations();
    await this.cleanupFailedDocuments();

    if (this.retentionPolicy.isOrphanedObjectCleanupEnabled()) {
      await this.cleanupOrphanedObjects();
    }

    this.logger.log('Daily maintenance cleanup completed.');
  }

  private async cleanupFailedDocuments() {
    const retentionDate = this.retentionPolicy.getFailedDocumentRetentionDate();
    this.logger.log(
      `Cleaning up FAILED documents older than ${retentionDate.toISOString()}`,
    );

    try {
      const staleDocs = await this.prisma.document.findMany({
        where: {
          status: 'FAILED',
          createdAt: { lt: retentionDate },
        },
        select: {
          id: true,
          storageKey: true,
          finalStorageKey: true,
        },
      });

      if (staleDocs.length === 0) {
        this.logger.log('No stale failed documents to clean up.');
        return;
      }

      for (const doc of staleDocs) {
        // 1. Delete from storage
        if (doc.storageKey) {
          await this.storage
            .deleteObject(doc.storageKey)
            .catch((e: Error) =>
              this.logger.warn(
                `Failed to delete storageKey ${doc.storageKey}: ${e.message}`,
              ),
            );
        }
        if (doc.finalStorageKey) {
          await this.storage
            .deleteObject(doc.finalStorageKey)
            .catch((e: Error) =>
              this.logger.warn(
                `Failed to delete finalStorageKey ${doc.finalStorageKey}: ${e.message}`,
              ),
            );
        }

        // 2. Delete related evaluations
        await this.prisma.aiEvaluationRun.deleteMany({
          where: { documentId: doc.id },
        });

        // 3. Delete document from DB
        await this.prisma.document.delete({
          where: { id: doc.id },
        });

        this.logger.debug(`Cleaned up stale failed document: ${doc.id}`);
      }
      this.logger.log(
        `Successfully cleaned up ${staleDocs.length} stale failed documents.`,
      );
    } catch (error) {
      this.logger.error('Error during failed documents cleanup', error);
    }
  }

  private async cleanupOldEvaluations() {
    const retentionDate = this.retentionPolicy.getAiEvaluationRetentionDate();
    this.logger.log(
      `Cleaning up AI evaluations older than ${retentionDate.toISOString()}`,
    );

    try {
      const result = await this.prisma.aiEvaluationRun.deleteMany({
        where: {
          createdAt: { lt: retentionDate },
        },
      });
      this.logger.log(
        `Successfully cleaned up ${result.count} old AI evaluations.`,
      );
    } catch (error) {
      this.logger.error('Error during old evaluations cleanup', error);
    }
  }

  private async cleanupOrphanedObjects() {
    this.logger.log('Scanning for orphaned storage objects...');

    try {
      const allObjectKeys = await this.storage.listObjects();
      if (allObjectKeys.length === 0) {
        this.logger.log('No objects found in storage.');
        return;
      }

      // Batch fetch all valid keys from DB
      // Note: For massive databases, this should be chunked/paginated.
      // Since this is groundwork, we do a simple check.
      const docs = await this.prisma.document.findMany({
        select: {
          storageKey: true,
          finalStorageKey: true,
        },
      });

      const validKeys = new Set<string>();
      for (const doc of docs) {
        if (doc.storageKey) validKeys.add(doc.storageKey);
        if (doc.finalStorageKey) validKeys.add(doc.finalStorageKey);
      }

      let orphanedCount = 0;
      for (const key of allObjectKeys) {
        if (!validKeys.has(key)) {
          await this.storage
            .deleteObject(key)
            .catch((e: Error) =>
              this.logger.warn(
                `Failed to delete orphaned object ${key}: ${e.message}`,
              ),
            );
          orphanedCount++;
          this.logger.debug(`Deleted orphaned object: ${key}`);
        }
      }

      this.logger.log(
        `Successfully cleaned up ${orphanedCount} orphaned storage objects.`,
      );
    } catch (error) {
      this.logger.error('Error during orphaned objects cleanup', error);
    }
  }
}
