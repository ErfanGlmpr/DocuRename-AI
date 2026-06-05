import { Injectable, Logger } from '@nestjs/common';
import { OcrService } from '../ocr/ocr.service';

export interface ExtractionResult {
  text: string;
  pageCount: number;
  ocrUsed: boolean;
  ocrTextLength?: number;
}

/**
 * PdfExtractionService — extracts text from PDF buffers.
 *
 * Pipeline:
 *   1. Attempt native text extraction via pdf-parse
 *   2. If extracted text length < OCR_MIN_TEXT_LENGTH (scanned/image PDF)
 *      AND OCR is enabled → fall back to OCR sidecar
 */
@Injectable()
export class PdfExtractionService {
  private readonly logger = new Logger(PdfExtractionService.name);

  constructor(private readonly ocrService: OcrService) {}

  async extractText(buffer: Buffer): Promise<ExtractionResult> {
    let extractedText = '';
    let pageCount = 0;

    // Step 1: Native pdf-parse extraction
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      extractedText = (result.text || '').trim();
      pageCount = result.total || 0;
      this.logger.debug(
        `pdf-parse extracted ${extractedText.length} chars from ${pageCount} pages`,
      );
    } catch (error) {
      this.logger.warn(
        'pdf-parse extraction failed, will attempt OCR if enabled',
        error,
      );
      // extractedText stays '' which will trigger OCR fallback
    }

    // Step 2: OCR fallback for scanned/image PDFs
    if (this.ocrService.needsOcr(extractedText)) {
      this.logger.log(
        `Text too short (${extractedText.length} chars < threshold) — triggering OCR fallback`,
      );
      const ocrResult = await this.ocrService.runOcr(buffer);
      return {
        text: ocrResult.text,
        pageCount,
        ocrUsed: true,
        ocrTextLength: ocrResult.ocrTextLength,
      };
    }

    if (!extractedText) {
      throw new Error(
        'No extractable text found in PDF. Enable OCR_ENABLED=true to process scanned PDFs.',
      );
    }

    return { text: extractedText, pageCount, ocrUsed: false };
  }
}
