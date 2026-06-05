import { Test, TestingModule } from '@nestjs/testing';
import {
  DocumentEventsService,
  DocumentEventType,
} from './document-events.service';
import { firstValueFrom, take, toArray } from 'rxjs';

describe('DocumentEventsService', () => {
  let service: DocumentEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentEventsService],
    }).compile();
    service = module.get<DocumentEventsService>(DocumentEventsService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('emits events on the global stream', async () => {
    const eventsPromise = firstValueFrom(service.streamAll().pipe(take(1)));

    service.emit(service.buildEvent('doc-1', 'DOCUMENT_QUEUED'));

    const result = await eventsPromise;
    expect(result.data.documentId).toBe('doc-1');
    expect(result.data.status).toBe('DOCUMENT_QUEUED');
  });

  it('filters events by documentId on per-document stream', async () => {
    const filteredPromise = firstValueFrom(
      service.streamDocument('doc-target').pipe(take(1)),
    );

    // This should be ignored
    service.emit(service.buildEvent('doc-other', 'DOCUMENT_QUEUED'));
    // This should pass through
    service.emit(
      service.buildEvent('doc-target', 'DOCUMENT_PROCESSING_STARTED'),
    );

    const result = await filteredPromise;
    expect(result.data.documentId).toBe('doc-target');
    expect(result.data.status).toBe('DOCUMENT_PROCESSING_STARTED');
  });

  it('includes meta when provided', () => {
    const event = service.buildEvent('doc-1', 'DOCUMENT_AI_COMPLETED', {
      confidence: 0.95,
    });
    expect(event.meta?.confidence).toBe(0.95);
  });

  it('emits multiple sequential events', async () => {
    const statuses: DocumentEventType[] = [
      'DOCUMENT_QUEUED',
      'DOCUMENT_PROCESSING_STARTED',
      'DOCUMENT_COMPLETED',
    ];

    const collectedPromise = firstValueFrom(
      service.streamAll().pipe(take(3), toArray()),
    );

    for (const status of statuses) {
      service.emit(service.buildEvent('doc-2', status));
    }

    const results = await collectedPromise;
    expect(results.map((r) => r.data.status)).toEqual(statuses);
  });
});
