import { Injectable } from '@nestjs/common';

export interface QualityScoreInput {
  pageCount: number | null | undefined;
  extractedTextLength: number;
  ocrUsed: boolean;
  aiConfidence: number | null | undefined;
  title: string | null | undefined;
  category: string | null | undefined;
  documentDate: string | null | undefined;
  issuer: string | null | undefined;
  recipient: string | null | undefined;
  referenceNumber: string | null | undefined;
  summary: string | null | undefined;
}

/**
 * DocumentQualityService — computes a 0-100 quality score for a processed document.
 *
 * Score breakdown (100 pts total):
 *
 *   Extraction quality (25 pts):
 *     - Expected ~1500 chars/page for normal text PDFs
 *     - Full score if chars/page >= 800; partial score below that
 *     - Penalty of 10 pts if OCR was required
 *
 *   AI confidence (35 pts):
 *     - Linear mapping of aiConfidence [0, 1] → [0, 35]
 *
 *   Metadata completeness (40 pts):
 *     - 5 fields × 8 pts each: title, category, documentDate, issuer, summary
 *     - (recipient and referenceNumber each worth 5 pts as bonus)
 *
 * The result is clamped to [0, 100].
 */
@Injectable()
export class DocumentQualityService {
  private static readonly EXPECTED_CHARS_PER_PAGE = 800;
  private static readonly EXTRACTION_MAX_PTS = 25;
  private static readonly CONFIDENCE_MAX_PTS = 35;
  private static readonly OCR_PENALTY = 10;

  // Core metadata fields and their point values
  private static readonly METADATA_FIELDS: Array<{
    key: keyof QualityScoreInput;
    pts: number;
  }> = [
    { key: 'title', pts: 8 },
    { key: 'category', pts: 8 },
    { key: 'documentDate', pts: 8 },
    { key: 'issuer', pts: 8 },
    { key: 'summary', pts: 8 },
    // bonus fields
    { key: 'recipient', pts: 5 },
    { key: 'referenceNumber', pts: 5 },
  ];

  calculate(input: QualityScoreInput): number {
    let score = 0;

    // ── Extraction quality ────────────────────────────────────────────────
    const pages = input.pageCount && input.pageCount > 0 ? input.pageCount : 1;
    const charsPerPage = input.extractedTextLength / pages;
    const extractionRatio = Math.min(
      charsPerPage / DocumentQualityService.EXPECTED_CHARS_PER_PAGE,
      1,
    );
    let extractionScore =
      extractionRatio * DocumentQualityService.EXTRACTION_MAX_PTS;
    if (input.ocrUsed) {
      extractionScore = Math.max(
        0,
        extractionScore - DocumentQualityService.OCR_PENALTY,
      );
    }
    score += extractionScore;

    // ── AI confidence ────────────────────────────────────────────────────
    const confidence = input.aiConfidence ?? 0;
    score += confidence * DocumentQualityService.CONFIDENCE_MAX_PTS;

    // ── Metadata completeness ────────────────────────────────────────────
    for (const { key, pts } of DocumentQualityService.METADATA_FIELDS) {
      const value = input[key];
      if (value && String(value).trim().length > 0) {
        score += pts;
      }
    }

    return Math.round(Math.min(100, Math.max(0, score)));
  }
}
