import { Module } from '@nestjs/common';
import { PdfExtractionService } from './pdf-extraction/pdf-extraction.service';
import { DocumentProcessorService } from './document-processor/document-processor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, StorageModule, AiModule],
  providers: [PdfExtractionService, DocumentProcessorService],
  exports: [PdfExtractionService]
})
export class ProcessingModule {}
