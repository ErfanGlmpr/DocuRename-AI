import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export type DocumentEventType =
  | 'DOCUMENT_QUEUED'
  | 'DOCUMENT_PROCESSING_STARTED'
  | 'DOCUMENT_VIRUS_SCAN_STARTED'
  | 'DOCUMENT_VIRUS_SCAN_PASSED'
  | 'DOCUMENT_VIRUS_SCAN_FAILED'
  | 'DOCUMENT_INFECTED'
  | 'DOCUMENT_TEXT_EXTRACTED'
  | 'DOCUMENT_OCR_STARTED'
  | 'DOCUMENT_OCR_COMPLETED'
  | 'DOCUMENT_PII_DETECTED'
  | 'DOCUMENT_AI_STARTED'
  | 'DOCUMENT_AI_COMPLETED'
  | 'DOCUMENT_COMPLETED'
  | 'DOCUMENT_FAILED';

export interface DocumentEvent {
  documentId: string;
  status: DocumentEventType;
  timestamp: string;
  /** Optional non-sensitive metadata attached to the event */
  meta?: Record<string, string | number | boolean>;
}

/**
 * DocumentEventsService — broadcasts document lifecycle events over SSE.
 *
 * Uses a global RxJS Subject so that events emitted inside BullMQ workers
 * (same NestJS process) are visible to HTTP SSE subscribers.
 *
 * No sensitive data (PII, file content, API keys) must be placed in events.
 */
@Injectable()
export class DocumentEventsService implements OnModuleDestroy {
  private readonly global$ = new Subject<DocumentEvent>();

  /** Emit an event for a document. Called by the processor and queue services. */
  emit(event: DocumentEvent): void {
    this.global$.next(event);
  }

  /**
   * Observable for ALL document events — suitable for the /documents/events endpoint.
   * Returns MessageEvent-shaped objects that NestJS @Sse() understands.
   */
  streamAll(): Observable<{ data: DocumentEvent }> {
    return this.global$.pipe(map((event) => ({ data: event })));
  }

  /**
   * Observable filtered to a single document — suitable for /documents/:id/events.
   */
  streamDocument(documentId: string): Observable<{ data: DocumentEvent }> {
    return this.global$.pipe(
      filter((event) => event.documentId === documentId),
      map((event) => ({ data: event })),
    );
  }

  /** Build a well-typed event object. */
  buildEvent(
    documentId: string,
    status: DocumentEventType,
    meta?: DocumentEvent['meta'],
  ): DocumentEvent {
    return {
      documentId,
      status,
      timestamp: new Date().toISOString(),
      ...(meta ? { meta } : {}),
    };
  }

  onModuleDestroy(): void {
    this.global$.complete();
  }
}
