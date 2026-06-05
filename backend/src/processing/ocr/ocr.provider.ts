/**
 * OcrProvider interface.
 * All OCR implementations must satisfy this contract.
 */
export interface OcrProvider {
  /**
   * Extract text from a PDF buffer using OCR.
   *
   * @param pdfBuffer  The raw PDF bytes to process
   * @returns Extracted text and the number of characters recognised
   */
  extractText(
    pdfBuffer: Buffer,
  ): Promise<{ text: string; ocrTextLength: number }>;
}
