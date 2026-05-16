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

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AiModule,
    PrivacyModule,
    AuditModule,
    forwardRef(() => DocumentsModule),
  ],
  providers: [
    PdfExtractionService,
    DocumentProcessorService,
    PromptMinimizationService,
  ],
  exports: [PdfExtractionService],
})
export class ProcessingModule {}
