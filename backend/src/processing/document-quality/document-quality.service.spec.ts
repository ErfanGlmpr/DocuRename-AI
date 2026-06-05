import { Test, TestingModule } from '@nestjs/testing';
import {
  DocumentQualityService,
  QualityScoreInput,
} from './document-quality.service';

describe('DocumentQualityService', () => {
  let service: DocumentQualityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentQualityService],
    }).compile();
    service = module.get<DocumentQualityService>(DocumentQualityService);
  });

  const base: QualityScoreInput = {
    pageCount: 2,
    extractedTextLength: 3000,
    ocrUsed: false,
    aiConfidence: 0.9,
    title: 'Invoice Q1',
    category: 'Finance',
    documentDate: '2024-01-15',
    issuer: 'Acme Corp',
    recipient: 'Client Ltd',
    referenceNumber: 'INV-2024-001',
    summary: 'Quarterly invoice for services rendered',
  };

  it('returns a score between 0 and 100', () => {
    const score = service.calculate(base);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns high score for a well-extracted, high-confidence, complete document', () => {
    const score = service.calculate(base);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('penalises OCR usage', () => {
    const withOcr = service.calculate({ ...base, ocrUsed: true });
    const withoutOcr = service.calculate({ ...base, ocrUsed: false });
    expect(withoutOcr).toBeGreaterThan(withOcr);
  });

  it('returns lower score when AI confidence is low', () => {
    const highConf = service.calculate({ ...base, aiConfidence: 1.0 });
    const lowConf = service.calculate({ ...base, aiConfidence: 0.1 });
    expect(highConf).toBeGreaterThan(lowConf);
  });

  it('returns lower score when metadata is incomplete', () => {
    const full = service.calculate(base);
    const sparse = service.calculate({
      ...base,
      title: null,
      category: null,
      issuer: null,
      recipient: null,
      referenceNumber: null,
    });
    expect(full).toBeGreaterThan(sparse);
  });

  it('handles null pageCount gracefully', () => {
    const score = service.calculate({ ...base, pageCount: null });
    expect(score).toBeGreaterThan(0);
  });

  it('clamps to 0 for a completely empty document', () => {
    const score = service.calculate({
      pageCount: 0,
      extractedTextLength: 0,
      ocrUsed: true,
      aiConfidence: 0,
      title: null,
      category: null,
      documentDate: null,
      issuer: null,
      recipient: null,
      referenceNumber: null,
      summary: null,
    });
    expect(score).toBe(0);
  });
});
