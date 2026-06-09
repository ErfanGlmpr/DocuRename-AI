import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

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
  organizationId?: string;
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
export class DocumentEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentEventsService.name);
  private readonly global$ = new Subject<DocumentEvent>();
  private pubClient?: Redis;
  private subClient?: Redis;
  private readonly transport: string;
  private readonly redisChannel = 'document-events';

  constructor(private configService: ConfigService) {
    this.transport =
      this.configService.get<string>('EVENT_TRANSPORT') || 'in-memory';
  }

  onModuleInit() {
    if (this.transport === 'redis') {
      const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
      const port = this.configService.get<number>('REDIS_PORT') || 6379;

      this.pubClient = new Redis({ host, port });
      this.subClient = new Redis({ host, port });

      this.subClient
        .subscribe(this.redisChannel)
        .then((count) => {
          this.logger.log(
            `Subscribed to ${String(
              count,
            )} channels. Listening for document events.`,
          );
        })
        .catch((err) => {
          this.logger.error(
            `Failed to subscribe to ${this.redisChannel}:`,
            err,
          );
        });

      this.subClient.on('message', (channel, message) => {
        if (channel === this.redisChannel) {
          try {
            const event = JSON.parse(message) as DocumentEvent;
            this.global$.next(event);
          } catch (e) {
            this.logger.error(
              'Failed to parse incoming document event from Redis',
              e,
            );
          }
        }
      });
    }
  }

  /** Emit an event for a document. Called by the processor and queue services. */
  emit(event: DocumentEvent): void {
    if (this.transport === 'redis' && this.pubClient) {
      this.pubClient
        .publish(this.redisChannel, JSON.stringify(event))
        .catch((err) => {
          this.logger.error('Failed to publish document event to Redis', err);
        });
    } else {
      this.global$.next(event);
    }
  }

  /**
   * Observable for ALL document events for a specific organization.
   * Filters the global stream by organizationId on each event.
   */
  streamAllForOrg(organizationId: string): Observable<{ data: DocumentEvent }> {
    return this.global$.pipe(
      filter((event) => event.organizationId === organizationId),
      map((event) => ({ data: event })),
    );
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
    organizationId?: string,
  ): DocumentEvent {
    return {
      documentId,
      status,
      timestamp: new Date().toISOString(),
      ...(organizationId ? { organizationId } : {}),
      ...(meta ? { meta } : {}),
    };
  }

  onModuleDestroy(): void {
    this.global$.complete();
    if (this.pubClient) {
      void this.pubClient.quit();
    }
    if (this.subClient) {
      void this.subClient.quit();
    }
  }
}
