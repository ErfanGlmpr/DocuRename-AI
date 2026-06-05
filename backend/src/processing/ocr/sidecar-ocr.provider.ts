import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { OcrProvider } from './ocr.provider';

/**
 * Calls the Python OCR sidecar microservice over HTTP.
 *
 * The sidecar handles all native dependencies (Tesseract, poppler).
 * NestJS only deals with HTTP and base64 serialisation.
 */
@Injectable()
export class SidecarOcrProvider implements OcrProvider {
  private readonly logger = new Logger(SidecarOcrProvider.name);
  private readonly sidecarUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.sidecarUrl =
      this.configService.get<string>('OCR_SIDECAR_URL') ||
      'http://localhost:8080';
    this.requestTimeoutMs = parseInt(
      this.configService.get<string>('OCR_SIDECAR_TIMEOUT_MS') || '180000',
      10,
    );
  }

  async extractText(
    pdfBuffer: Buffer,
  ): Promise<{ text: string; ocrTextLength: number }> {
    const pdfBase64 = pdfBuffer.toString('base64');

    this.logger.debug(
      `Sending ${Math.round(pdfBuffer.length / 1024)} KB to OCR sidecar at ${this.sidecarUrl}/ocr`,
    );

    try {
      const response = await axios.post<{
        text: string;
        pages: number;
        durationMs: number;
        success: boolean;
      }>(
        `${this.sidecarUrl}/ocr`,
        { pdf: pdfBase64 },
        { timeout: this.requestTimeoutMs },
      );

      const { text, pages, durationMs } = response.data;
      this.logger.log(
        `OCR sidecar returned: ${pages} pages, ${text.length} chars, ${durationMs} ms`,
      );

      return { text, ocrTextLength: text.length };
    } catch (err) {
      const axiosErr = err as AxiosError;
      const detail = axiosErr.response?.data
        ? JSON.stringify(axiosErr.response.data)
        : axiosErr.message;
      throw new Error(`OCR sidecar request failed: ${detail}`);
    }
  }
}
