import { Test, TestingModule } from '@nestjs/testing';
import { PdfExtractionService } from './pdf-extraction.service';
import { PDFParse } from 'pdf-parse';

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn(),
  })),
}));

describe('PdfExtractionService', () => {
  let service: PdfExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfExtractionService],
    }).compile();

    service = module.get<PdfExtractionService>(PdfExtractionService);
    jest.clearAllMocks();
  });

  it('should extract text successfully', async () => {
    const mockGetText = jest.fn().mockResolvedValue({
      text: '  extracted text  ',
      total: 1,
    });
    (PDFParse as jest.Mock).mockImplementation(() => ({
      getText: mockGetText,
    }));

    const buffer = Buffer.from('dummy');
    const result = await service.extractText(buffer);

    expect(result.text).toBe('extracted text');
    expect(result.pageCount).toBe(1);
    expect(PDFParse).toHaveBeenCalledWith({ data: buffer });
    expect(mockGetText).toHaveBeenCalled();
  });

  it('should throw error if text is empty', async () => {
    const mockGetText = jest.fn().mockResolvedValue({ text: '   ', total: 0 });
    (PDFParse as jest.Mock).mockImplementation(() => ({
      getText: mockGetText,
    }));

    const buffer = Buffer.from('dummy');
    await expect(service.extractText(buffer)).rejects.toThrow(
      'No extractable text found',
    );
  });
});
