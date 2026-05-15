import { Test, TestingModule } from '@nestjs/testing';
import { PdfExtractionService } from './pdf-extraction.service';
import pdfParse from 'pdf-parse';

jest.mock('pdf-parse', () => jest.fn());

describe('PdfExtractionService', () => {
  let service: PdfExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfExtractionService],
    }).compile();

    service = module.get<PdfExtractionService>(PdfExtractionService);
  });

  it('should extract text successfully', async () => {
    (pdfParse as jest.Mock).mockResolvedValue({ text: '  extracted text  ' });
    
    const buffer = Buffer.from('dummy');
    const result = await service.extractText(buffer);
    
    expect(result).toBe('extracted text');
  });

  it('should throw error if text is empty', async () => {
    (pdfParse as jest.Mock).mockResolvedValue({ text: '   ' });
    
    const buffer = Buffer.from('dummy');
    await expect(service.extractText(buffer)).rejects.toThrow('No extractable text found');
  });
});
