import { Module } from '@nestjs/common';
import { DocumentEventsService } from './document-events.service';
import { DocumentEventsController } from './document-events.controller';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [AuthModule, DocumentsModule],
  providers: [DocumentEventsService],
  controllers: [DocumentEventsController],
  exports: [DocumentEventsService],
})
export class EventsModule {}
