import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

/**
 * MetricsService — wraps prom-client with a dedicated Registry (not the global one).
 *
 * Using a dedicated Registry avoids conflicts when running multiple test suites
 * that each instantiate the service.
 *
 * Metrics exposed:
 *   Counters
 *     documents_processed_total
 *     documents_failed_total
 *     ocr_runs_total
 *     ocr_success_total
 *     virus_scan_total
 *     virus_scan_failed_total
 *     provider_requests_total        {provider}
 *     provider_failures_total        {provider}
 *
 *   Histograms
 *     document_processing_duration_seconds
 *     ai_latency_seconds             {provider}
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry: client.Registry;

  // ── Counters ──────────────────────────────────────────────────────────
  readonly documentsProcessedTotal: client.Counter;
  readonly documentsFailedTotal: client.Counter;
  readonly ocrRunsTotal: client.Counter;
  readonly ocrSuccessTotal: client.Counter;
  readonly virusScanTotal: client.Counter;
  readonly virusScanFailedTotal: client.Counter;
  readonly providerRequestsTotal: client.Counter<'provider'>;
  readonly providerFailuresTotal: client.Counter<'provider'>;

  // ── Histograms ────────────────────────────────────────────────────────
  readonly documentProcessingDurationSeconds: client.Histogram;
  readonly aiLatencySeconds: client.Histogram<'provider'>;

  constructor() {
    this.registry = new client.Registry();
    this.registry.setDefaultLabels({ app: 'docurename-ai' });

    this.documentsProcessedTotal = new client.Counter({
      name: 'documents_processed_total',
      help: 'Total number of successfully processed documents',
      registers: [this.registry],
    });

    this.documentsFailedTotal = new client.Counter({
      name: 'documents_failed_total',
      help: 'Total number of documents that failed processing',
      registers: [this.registry],
    });

    this.ocrRunsTotal = new client.Counter({
      name: 'ocr_runs_total',
      help: 'Total number of OCR runs initiated',
      registers: [this.registry],
    });

    this.ocrSuccessTotal = new client.Counter({
      name: 'ocr_success_total',
      help: 'Total number of successful OCR runs',
      registers: [this.registry],
    });

    this.virusScanTotal = new client.Counter({
      name: 'virus_scan_total',
      help: 'Total number of virus scans performed',
      registers: [this.registry],
    });

    this.virusScanFailedTotal = new client.Counter({
      name: 'virus_scan_failed_total',
      help: 'Total number of virus scans that detected a threat',
      registers: [this.registry],
    });

    this.providerRequestsTotal = new client.Counter({
      name: 'provider_requests_total',
      help: 'Total AI provider requests',
      labelNames: ['provider'],
      registers: [this.registry],
    });

    this.providerFailuresTotal = new client.Counter({
      name: 'provider_failures_total',
      help: 'Total AI provider failures',
      labelNames: ['provider'],
      registers: [this.registry],
    });

    this.documentProcessingDurationSeconds = new client.Histogram({
      name: 'document_processing_duration_seconds',
      help: 'End-to-end document processing duration in seconds',
      buckets: [5, 15, 30, 60, 120, 300, 600, 900],
      registers: [this.registry],
    });

    this.aiLatencySeconds = new client.Histogram({
      name: 'ai_latency_seconds',
      help: 'AI provider request latency in seconds',
      labelNames: ['provider'],
      buckets: [1, 2, 5, 10, 20, 30, 60, 120],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    // Collect Node.js default metrics (memory, CPU, GC, event loop)
    client.collectDefaultMetrics({ register: this.registry, prefix: 'node_' });
  }

  /** Render metrics in Prometheus text format. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Content-type header value for the metrics endpoint. */
  contentType(): string {
    return this.registry.contentType;
  }
}
