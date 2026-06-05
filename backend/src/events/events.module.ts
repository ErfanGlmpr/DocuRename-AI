import { Module } from '@nestjs/common';
import { DocumentEventsService } from './document-events.service';
import { DocumentEventsController } from './document-events.controller';

@Module({
  providers: [DocumentEventsService],
  controllers: [DocumentEventsController],
  exports: [DocumentEventsService],
})
export class EventsModule {}
