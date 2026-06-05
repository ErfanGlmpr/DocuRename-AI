import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    service.onModuleInit();
  });

  it('returns non-empty Prometheus metrics string', async () => {
    const metrics = await service.getMetrics();
    expect(typeof metrics).toBe('string');
    expect(metrics.length).toBeGreaterThan(0);
  });

  it('exposes documents_processed_total counter', async () => {
    service.documentsProcessedTotal.inc();
    const metrics = await service.getMetrics();
    expect(metrics).toContain('documents_processed_total');
  });

  it('exposes provider_requests_total with label', async () => {
    service.providerRequestsTotal.inc({ provider: 'ollama' });
    const metrics = await service.getMetrics();
    expect(metrics).toContain('provider_requests_total');
    expect(metrics).toContain('ollama');
  });

  it('exposes document_processing_duration_seconds histogram', async () => {
    service.documentProcessingDurationSeconds.observe(42);
    const metrics = await service.getMetrics();
    expect(metrics).toContain('document_processing_duration_seconds');
  });

  it('contentType returns Prometheus content-type string', () => {
    expect(service.contentType()).toContain('text/plain');
  });
});
