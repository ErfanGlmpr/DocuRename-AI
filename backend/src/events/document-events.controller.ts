import { Controller, Param, Sse } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  DocumentEventsService,
  DocumentEvent,
} from './document-events.service';

@ApiTags('events')
@Controller('documents')
export class DocumentEventsController {
  constructor(private readonly eventsService: DocumentEventsService) {}

  /**
   * GET /documents/events
   *
   * Server-Sent Events stream for ALL documents.
   * Each event carries: { documentId, status, timestamp }.
   */
  @Sse('events')
  @ApiOperation({
    summary: 'SSE stream for all document events',
    description:
      'Server-Sent Events stream. Connect with EventSource. ' +
      'Emits events for every document processed in the system.',
  })
  streamAll(): Observable<{ data: DocumentEvent }> {
    return this.eventsService.streamAll();
  }

  /**
   * GET /documents/:id/events
   *
   * Server-Sent Events stream scoped to a single document.
   */
  @Sse(':id/events')
  @ApiOperation({
    summary: 'SSE stream for a single document',
    description:
      'Server-Sent Events stream scoped to one document. ' +
      'Connect with EventSource("GET /documents/{id}/events").',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  streamDocument(@Param('id') id: string): Observable<{ data: DocumentEvent }> {
    return this.eventsService.streamDocument(id);
  }
}
