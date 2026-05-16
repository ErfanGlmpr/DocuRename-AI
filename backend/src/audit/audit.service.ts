import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface AuditLogEntry {
  documentId?: string;
  action: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Defensive check: metadata must not contain banned fields
      const sanitizedMetadata = this.sanitizeMetadata(entry.metadata);

      await this.prisma.auditLog.create({
        data: {
          documentId: entry.documentId,
          action: entry.action,
          metadata: (sanitizedMetadata || {}) as Prisma.InputJsonValue,
        },
      });

      this.logger.debug(
        `Audit log: ${entry.action} for document ${entry.documentId}`,
      );
    } catch (error) {
      // Fire-and-forget: audit must not break main flow
      this.logger.error(
        `Failed to write audit log: ${entry.action}`,
        (error as Error).message,
      );
    }
  }

  private sanitizeMetadata(
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!metadata) return metadata;

    const bannedKeys = [
      'extractedText',
      'redactedText',
      'piiValue',
      'tokenMap',
      'decryptedMap',
      'prompt',
      'originalValue',
    ];

    const sanitized: Record<string, unknown> = { ...metadata };
    for (const key of bannedKeys) {
      if (key in sanitized) {
        delete sanitized[key];
        sanitized[`_${key}_removed`] = true;
      }
    }

    return sanitized;
  }
}
