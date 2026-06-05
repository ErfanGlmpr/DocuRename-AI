import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SidecarOcrProvider } from './sidecar-ocr.provider';

export interface OcrResult {
  text: string;
  ocrTextLength: number;
  ocrUsed: boolean;
}

/**
 * OcrService – decides when OCR is needed and delegates to the sidecar provider.
 *
 * OCR runs only when:
 *  1. OCR_ENABLED=true (or not set to 'false')
 *  2. Extracted text length is below OCR_MIN_TEXT_LENGTH threshold
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly enabled: boolean;
  private readonly minTextLength: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly sidecarOcrProvider: SidecarOcrProvider,
  ) {
    this.enabled = this.configService.get<string>('OCR_ENABLED') !== 'false';
    this.minTextLength = parseInt(
      this.configService.get<string>('OCR_MIN_TEXT_LENGTH') || '100',
      10,
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Returns true when the extracted text is too short to be useful and OCR is enabled.
   */
  needsOcr(extractedText: string): boolean {
    return this.enabled && extractedText.trim().length < this.minTextLength;
  }

  /**
   * Runs OCR on the provided PDF buffer via the sidecar.
   */
  async runOcr(pdfBuffer: Buffer): Promise<OcrResult> {
    this.logger.log('Running OCR via sidecar provider');
    try {
      const { text, ocrTextLength } =
        await this.sidecarOcrProvider.extractText(pdfBuffer);
      return { text, ocrTextLength, ocrUsed: true };
    } catch (err) {
      this.logger.error('OCR sidecar failed', (err as Error).message);
      throw err;
    }
  }
}
