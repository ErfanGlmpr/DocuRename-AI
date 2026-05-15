import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class PdfExtractionService {
  private readonly logger = new Logger(PdfExtractionService.name);

  async extractText(buffer: Buffer): Promise<string> {
    try {
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      if (!data.text || data.text.trim().length === 0) {
        throw new Error('No extractable text found. OCR is not implemented in Phase 1.');
      }
      return data.text.trim();
    } catch (error) {
      this.logger.error('Failed to extract text from PDF', error);
      throw error;
    }
  }
}
