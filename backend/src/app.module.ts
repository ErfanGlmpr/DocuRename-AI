import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { OrganizationsModule } from './organizations/organizations.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CancellationModule,
    StorageModule,
    EventsModule,
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
    ObservabilityModule,
    HealthModule,
    // Phase 5
    AuthModule,
    OrganizationsModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: (config.get<number>('RATE_LIMIT_TTL_SECONDS') || 60) * 1000,
            limit: config.get<number>('RATE_LIMIT_MAX_REQUESTS') || 100,
          },
        ],
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
