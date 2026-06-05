import { Module, forwardRef } from '@nestjs/common';
import { PdfExtractionService } from './pdf-extraction/pdf-extraction.service';
import { DocumentProcessorService } from './document-processor/document-processor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { AuditModule } from '../audit/audit.module';
import { PromptMinimizationService } from './prompt-minimization/prompt-minimization.service';
import { DocumentsModule } from '../documents/documents.module';
import { OcrService } from './ocr/ocr.service';
import { SidecarOcrProvider } from './ocr/sidecar-ocr.provider';
import { DocumentChunkingService } from './document-chunking/document-chunking.service';
import { DocumentQualityService } from './document-quality/document-quality.service';
import { SecurityModule } from '../security/security.module';
import { EventsModule } from '../events/events.module';
import { ObservabilityModule } from '../observability/observability.module';
import { RetryPolicyService } from '../queue/retry-policy.service';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AiModule,
    PrivacyModule,
    AuditModule,
    SecurityModule,
    EventsModule,
    ObservabilityModule,
    forwardRef(() => DocumentsModule),
  ],
  providers: [
    // OCR
    SidecarOcrProvider,
    OcrService,
    // PDF extraction (depends on OcrService)
    PdfExtractionService,
    // Processing utilities
    PromptMinimizationService,
    DocumentChunkingService,
    DocumentQualityService,
    // Retry policy
    RetryPolicyService,
    // Main processor
    DocumentProcessorService,
  ],
  exports: [
    PdfExtractionService,
    PromptMinimizationService,
    DocumentChunkingService,
  ],
})
export class ProcessingModule {}
