import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RetentionPolicyService {
  constructor(private readonly configService: ConfigService) {}

  getFailedDocumentRetentionDate(): Date {
    const days = this.configService.get<number>(
      'FAILED_DOCUMENT_RETENTION_DAYS',
      30,
    );
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  getAiEvaluationRetentionDate(): Date {
    const days = this.configService.get<number>(
      'AI_EVALUATION_RETENTION_DAYS',
      30,
    );
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  isCleanupEnabled(): boolean {
    return this.configService.get<string>('CLEANUP_ENABLED') === 'true';
  }

  isOrphanedObjectCleanupEnabled(): boolean {
    return this.configService.get<string>('DELETE_ORPHANED_OBJECTS') === 'true';
  }
}
