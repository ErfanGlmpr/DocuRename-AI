import { Test, TestingModule } from '@nestjs/testing';
import { PromptMinimizationService } from './prompt-minimization.service';
import { ConfigService } from '@nestjs/config';

describe('PromptMinimizationService', () => {
  let service: PromptMinimizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptMinimizationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'AI_INPUT_MAX_CHARS') return '50';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PromptMinimizationService>(PromptMinimizationService);
  });

  it('should not minimize if text is shorter than maxChars', () => {
    const text = 'Short text';
    const result = service.minimize(text);
    expect(result.minimizedText).toBe(text);
    expect(result.minimizedLength).toBe(text.length);
  });

  it('should prioritize lines with keywords', () => {
    const text = 'Line 1\nInvoice #12345\nLine 3\nLine 4\nLine 5\nLine 6';
    // Max chars is 50, so it must choose. "Invoice" is a keyword.
    const result = service.minimize(text);
    expect(result.minimizedText).toContain('Invoice #12345');
  });

  it('should truncate to maxChars as a last resort', () => {
    const longLine = 'A'.repeat(100);
    const result = service.minimize(longLine);
    expect(result.minimizedText.length).toBeLessThanOrEqual(50);
  });
});
