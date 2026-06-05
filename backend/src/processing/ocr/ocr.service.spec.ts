import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OcrService } from './ocr.service';
import { SidecarOcrProvider } from './sidecar-ocr.provider';

describe('OcrService', () => {
  let service: OcrService;
  let sidecarProvider: jest.Mocked<SidecarOcrProvider>;

  beforeEach(async () => {
    sidecarProvider = {
      extractText: jest.fn(),
    } as unknown as jest.Mocked<SidecarOcrProvider>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        { provide: SidecarOcrProvider, useValue: sidecarProvider },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'OCR_ENABLED') return 'true';
              if (key === 'OCR_MIN_TEXT_LENGTH') return '100';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get<OcrService>(OcrService);
  });

  describe('isEnabled', () => {
    it('returns true when OCR_ENABLED is not false', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('needsOcr', () => {
    it('returns true when text is below threshold', () => {
      expect(service.needsOcr('short')).toBe(true);
    });

    it('returns false when text meets the threshold', () => {
      const longText = 'a'.repeat(150);
      expect(service.needsOcr(longText)).toBe(false);
    });
  });

  describe('runOcr', () => {
    it('delegates to sidecar provider and returns result', async () => {
      sidecarProvider.extractText.mockResolvedValue({
        text: 'extracted text from ocr',
        ocrTextLength: 23,
      });

      const buffer = Buffer.from('fake-pdf');
      const result = await service.runOcr(buffer);

      expect(result.ocrUsed).toBe(true);
      expect(result.text).toBe('extracted text from ocr');
      expect(result.ocrTextLength).toBe(23);
      expect(sidecarProvider.extractText).toHaveBeenCalledWith(buffer);
    });

    it('propagates errors from the sidecar provider', async () => {
      sidecarProvider.extractText.mockRejectedValue(
        new Error('sidecar unavailable'),
      );

      await expect(service.runOcr(Buffer.from('pdf'))).rejects.toThrow(
        'sidecar unavailable',
      );
    });
  });
});
