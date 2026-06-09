import { Module } from '@nestjs/common';
import { DocumentEventsService } from './document-events.service';
import { DocumentEventsController } from './document-events.controller';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [AuthModule, DocumentsModule, ConfigModule],
  providers: [DocumentEventsService],
  controllers: [DocumentEventsController],
  exports: [DocumentEventsService],
})
export class EventsModule {}
