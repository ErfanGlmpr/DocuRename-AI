import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(organizationId: string) {
    // Document counts by status
    const statusGroups = await this.prisma.document.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: {
        _all: true,
      },
    });

    const documentCountsByStatus = statusGroups.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Failed document count
    const failedDocumentCount =
      documentCountsByStatus[DocumentStatus.FAILED] || 0;

    // Processing document count
    const processingDocumentCount =
      (documentCountsByStatus[DocumentStatus.QUEUED] || 0) +
      (documentCountsByStatus[DocumentStatus.VIRUS_SCANNING] || 0) +
      (documentCountsByStatus[DocumentStatus.EXTRACTING_TEXT] || 0) +
      (documentCountsByStatus[DocumentStatus.ANALYZING_WITH_AI] || 0) +
      (documentCountsByStatus[DocumentStatus.RENAMING] || 0);

    // Average processing duration
    const durationAgg = await this.prisma.document.aggregate({
      where: {
        organizationId,
        processingDurationMs: { not: null },
      },
      _avg: {
        processingDurationMs: true,
      },
    });
    const averageProcessingDuration =
      durationAgg._avg.processingDurationMs || 0;

    // Provider usage counts
    const providerGroups = await this.prisma.document.groupBy({
      by: ['aiProvider'],
      where: { organizationId, aiProvider: { not: null } },
      _count: {
        _all: true,
      },
    });

    const providerUsageCounts = providerGroups.reduce(
      (acc, curr) => {
        if (curr.aiProvider) {
          acc[curr.aiProvider] = curr._count._all;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    // OCR usage count
    const ocrUsageCount = await this.prisma.document.count({
      where: { organizationId, ocrUsed: true },
    });

    // Virus scan failures
    const virusScanFailures = await this.prisma.document.count({
      where: { organizationId, status: DocumentStatus.INFECTED },
    });

    return {
      documentCountsByStatus,
      failedDocumentCount,
      processingDocumentCount,
      averageProcessingDuration,
      providerUsageCounts,
      ocrUsageCount,
      virusScanFailures,
    };
  }
}
