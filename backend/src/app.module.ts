import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from './storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';
import { DocumentsModule } from './documents/documents.module';
import { UploadsModule } from './uploads/uploads.module';
import { QueueModule } from './queue/queue.module';
import { ProcessingModule } from './processing/processing.module';
import { AiModule } from './ai/ai.module';
import { PrivacyModule } from './privacy/privacy.module';
import { AuditModule } from './audit/audit.module';
import { CancellationModule } from './cancellation/cancellation.module';
import { AiEvaluationModule } from './ai-evaluation/ai-evaluation.module';
// Phase 4
import { EventsModule } from './events/events.module';
import { ObservabilityModule } from './observability/observability.module';
import { HealthModule } from './health/health.module';
// Phase 5
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CancellationModule,
    StorageModule,
    PrismaModule,
    DocumentsModule,
    UploadsModule,
    QueueModule,
    ProcessingModule,
    AiModule,
    PrivacyModule,
    AuditModule,
    AiEvaluationModule,
    // Phase 4
    EventsModule,
    ObservabilityModule,
    HealthModule,
    // Phase 5
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
