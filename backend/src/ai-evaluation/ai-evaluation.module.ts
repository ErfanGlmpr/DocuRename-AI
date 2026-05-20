import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiEvaluationController } from './ai-evaluation.controller';
import { AiEvaluationService } from './ai-evaluation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ProcessingModule } from '../processing/processing.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AiModule,
    ProcessingModule,
    AuditModule,
  ],
  controllers: [AiEvaluationController],
  providers: [AiEvaluationService],
  exports: [AiEvaluationService],
})
export class AiEvaluationModule {}
