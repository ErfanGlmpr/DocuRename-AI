import { Test, TestingModule } from '@nestjs/testing';
import { FilenameGeneratorService } from './filename-generator.service';
import { DocumentMetadata } from '../ai.provider';

describe('FilenameGeneratorService', () => {
  let service: FilenameGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilenameGeneratorService],
    }).compile();

    service = module.get<FilenameGeneratorService>(FilenameGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should use suggestedFilename if provided', () => {
    const metadata: DocumentMetadata = {
      title: 'Test',
      category: 'invoice',
      documentDate: '2025-01-01',
      issuer: 'Acme',
      recipient: 'Us',
      referenceNumber: '123',
      suggestedFilename: 'Custom Name!.pdf',
      confidence: 0.9,
      summary: 'Test',
      language: 'en',
    };

    const result = service.generateSafeFilename(metadata, 'orig.pdf');
    expect(result).toBe('custom-name-.pdf'); // sanitized
  });

  it('should fallback to metadata when suggestedFilename is missing', () => {
    const metadata: DocumentMetadata = {
      title: 'Test',
      category: 'invoice',
      documentDate: '2025-01-01',
      issuer: 'Acme',
      recipient: 'Us',
      referenceNumber: '123',
      suggestedFilename: '',
      confidence: 0.9,
      summary: 'Test',
      language: 'en',
    };

    const result = service.generateSafeFilename(metadata, 'orig.pdf');
    expect(result).toBe('2025-01-01_invoice_acme_123.pdf');
  });

  it('should sanitize unsafe characters', () => {
    const metadata: DocumentMetadata = {
      title: 'Test',
      category: 'other',
      documentDate: null,
      issuer: 'Bad/Name\\Here',
      recipient: null,
      referenceNumber: 'REF#456',
      suggestedFilename: '',
      confidence: 0.9,
      summary: 'Test',
      language: 'en',
    };

    const result = service.generateSafeFilename(metadata, 'orig.pdf');
    expect(result).toBe('unknown-date_other_bad-name-here_ref-456.pdf');
  });

  it('should transliterate diacritics (umlauts) correctly using @sindresorhus/transliterate', () => {
    const metadata: DocumentMetadata = {
      title: 'Test',
      category: 'other',
      documentDate: null,
      issuer: 'Abtretungserklärung',
      recipient: null,
      referenceNumber: null,
      suggestedFilename: '',
      confidence: 0.9,
      summary: 'Test',
      language: 'de',
    };

    const result = service.generateSafeFilename(metadata, 'orig.pdf');
    expect(result).toBe('unknown-date_other_abtretungserklaerung.pdf');
  });

  it('should transliterate diacritics (umlauts) to standard characters using Swedish rules if language is Swedish', () => {
    const metadata: DocumentMetadata = {
      title: 'Test',
      category: 'other',
      documentDate: null,
      issuer: 'Abtretungserklärung',
      recipient: null,
      referenceNumber: null,
      suggestedFilename: '',
      confidence: 0.9,
      summary: 'Test',
      language: 'sv',
    };

    const result = service.generateSafeFilename(metadata, 'orig.pdf');
    expect(result).toBe('unknown-date_other_abtretungserklarung.pdf');
  });
});
