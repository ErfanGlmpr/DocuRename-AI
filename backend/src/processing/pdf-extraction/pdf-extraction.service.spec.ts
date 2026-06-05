import { Test, TestingModule } from '@nestjs/testing';
import { PdfExtractionService } from './pdf-extraction.service';
import { OcrService } from '../ocr/ocr.service';
import { PDFParse } from 'pdf-parse';

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn(),
  })),
}));

describe('PdfExtractionService', () => {
  let service: PdfExtractionService;
  let ocrService: jest.Mocked<OcrService>;

  beforeEach(async () => {
    ocrService = {
      isEnabled: jest.fn().mockReturnValue(false),
      needsOcr: jest.fn().mockReturnValue(false),
      runOcr: jest.fn(),
    } as unknown as jest.Mocked<OcrService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfExtractionService,
        { provide: OcrService, useValue: ocrService },
      ],
    }).compile();

    service = module.get<PdfExtractionService>(PdfExtractionService);
    jest.clearAllMocks();
  });

  it('should extract text successfully when text is above threshold', async () => {
    const longText = 'extracted text '.repeat(20); // well above 100 chars
    const mockGetText = jest
      .fn()
      .mockResolvedValue({ text: longText, total: 1 });
    (PDFParse as jest.Mock).mockImplementation(() => ({
      getText: mockGetText,
    }));
    ocrService.needsOcr.mockReturnValue(false);

    const buffer = Buffer.from('dummy');
    const result = await service.extractText(buffer);

    expect(result.text.trim()).toBe(longText.trim());
    expect(result.pageCount).toBe(1);
    expect(result.ocrUsed).toBe(false);
  });

  it('should fall back to OCR when text is below threshold', async () => {
    const mockGetText = jest
      .fn()
      .mockResolvedValue({ text: 'short', total: 1 });
    (PDFParse as jest.Mock).mockImplementation(() => ({
      getText: mockGetText,
    }));
    ocrService.needsOcr.mockReturnValue(true);
    ocrService.runOcr.mockResolvedValue({
      text: 'ocr extracted text from scanned pdf',
      ocrTextLength: 35,
      ocrUsed: true,
    });

    const buffer = Buffer.from('dummy');
    const result = await service.extractText(buffer);

    expect(result.ocrUsed).toBe(true);
    expect(result.text).toBe('ocr extracted text from scanned pdf');
    expect(ocrService.runOcr).toHaveBeenCalledWith(buffer);
  });

  it('should throw when no text and OCR is disabled', async () => {
    const mockGetText = jest.fn().mockResolvedValue({ text: '   ', total: 0 });
    (PDFParse as jest.Mock).mockImplementation(() => ({
      getText: mockGetText,
    }));
    ocrService.needsOcr.mockReturnValue(false); // OCR disabled

    const buffer = Buffer.from('dummy');
    await expect(service.extractText(buffer)).rejects.toThrow(
      'No extractable text found',
    );
  });
});
