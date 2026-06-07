import { Controller, Param, Sse, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  DocumentEventsService,
  DocumentEvent,
} from './document-events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DocumentsService } from '../documents/documents.service';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentEventsController {
  constructor(
    private readonly eventsService: DocumentEventsService,
    private readonly documentsService: DocumentsService,
  ) {}

  /**
   * GET /documents/events
   *
   * Server-Sent Events stream for documents belonging to the authenticated user's organization.
   * Each event carries: { documentId, status, timestamp }.
   * Events for other organizations are silently filtered out.
   */
  @Sse('events')
  @ApiOperation({
    summary: 'SSE stream for all document events in your organization',
    description:
      'Server-Sent Events stream. Connect with EventSource. ' +
      'Emits events only for documents in your organization.',
  })
  streamAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Observable<{ data: DocumentEvent }> {
    return this.eventsService.streamAllForOrg(user.organizationId);
  }

  /**
   * GET /documents/:id/events
   *
   * Server-Sent Events stream scoped to a single document.
   * The document must belong to the authenticated user's organization.
   */
  @Sse(':id/events')
  @ApiOperation({
    summary: 'SSE stream for a single document',
    description:
      'Server-Sent Events stream scoped to one document. ' +
      'Connect with EventSource("GET /documents/{id}/events").',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async streamDocument(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Observable<{ data: DocumentEvent }>> {
    // Verify the document belongs to the user's org (throws NotFoundException if not)
    await this.documentsService.findOne(id, user.organizationId);
    return this.eventsService.streamDocument(id);
  }
}
