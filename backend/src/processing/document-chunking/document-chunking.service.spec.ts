import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DocumentChunkingService } from './document-chunking.service';

function makeText(length: number): string {
  return 'word '.repeat(Math.ceil(length / 5)).substring(0, length);
}

describe('DocumentChunkingService', () => {
  let service: DocumentChunkingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentChunkingService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'AI_MAX_INPUT_CHARS' ? '500' : undefined,
          },
        },
      ],
    }).compile();

    service = module.get<DocumentChunkingService>(DocumentChunkingService);
  });

  it('returns text as-is when within limit', () => {
    const text = makeText(200);
    const result = service.chunk(text);
    expect(result.wasChunked).toBe(false);
    expect(result.chunkCount).toBe(1);
    expect(result.inputTextLength).toBe(200);
    expect(result.selectedText).toBe(text);
  });

  it('truncates oversized text to maxChars', () => {
    const text = makeText(2000);
    const result = service.chunk(text);
    expect(result.wasChunked).toBe(true);
    expect(result.selectedText.length).toBeLessThanOrEqual(500);
    expect(result.inputTextLength).toBe(2000);
    expect(result.chunkCount).toBeGreaterThan(1);
  });

  it('prioritises heading lines', () => {
    const heading = 'INVOICE SUMMARY';
    const body = makeText(600);
    const text = `${body}\n${heading}`;
    const result = service.chunk(text);
    expect(result.selectedText).toContain(heading);
  });

  it('prioritises keyword-bearing lines', () => {
    const keywordLine = 'Total amount due: EUR 5,000.00';
    const filler = 'lorem ipsum '.repeat(50);
    const text = `${filler}\n${keywordLine}`;
    const result = service.chunk(text);
    expect(result.selectedText).toContain(keywordLine);
  });
});
