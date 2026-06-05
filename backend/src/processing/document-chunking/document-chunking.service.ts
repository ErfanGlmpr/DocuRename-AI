import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KEYWORDS } from '../../privacy/pii-patterns';

export interface DocumentChunk {
  content: string;
  score: number;
  type: 'heading' | 'keyword' | 'body';
}

export interface ChunkSummaryResult {
  selectedText: string;
  chunks: DocumentChunk[];
  chunkCount: number;
  inputTextLength: number;
  wasChunked: boolean;
}

/**
 * DocumentChunkingService — intelligent text selection for large documents.
 *
 * When document text exceeds AI_MAX_INPUT_CHARS, this service selects the
 * most information-dense sections using a priority scoring system:
 *
 *   40 pts  – heading lines (short ALL-CAPS or ## prefixed)
 *   30 pts  – keyword-rich lines (financial, legal, dates, identifiers)
 *   10 pts  – first-page content (positional bonus)
 *    0 pts  – body text (fill after priority sections)
 *
 * The result always fits within AI_MAX_INPUT_CHARS characters.
 */
@Injectable()
export class DocumentChunkingService {
  private readonly maxChars: number;

  // Legal / financial section headings that are especially valuable
  private static readonly SECTION_KEYWORDS = [
    ...KEYWORDS,
    'agreement',
    'contract',
    'invoice',
    'total',
    'amount',
    'balance',
    'payment',
    'tax',
    'vat',
    'signature',
    'signed',
    'effective date',
    'expiry',
    'party',
    'parties',
    'clause',
    'section',
    'schedule',
    'annex',
    'exhibit',
    'herein',
    'whereas',
    'therefore',
  ];

  constructor(private readonly configService: ConfigService) {
    this.maxChars = parseInt(
      this.configService.get<string>('AI_MAX_INPUT_CHARS') || '12000',
      10,
    );
  }

  /**
   * Selects text for AI input.
   *
   * If the text already fits within the limit, it is returned as-is (no chunking).
   * Otherwise, a priority-scored selection algorithm picks the most relevant lines.
   */
  chunk(text: string): ChunkSummaryResult {
    const inputTextLength = text.length;

    if (inputTextLength <= this.maxChars) {
      return {
        selectedText: text,
        chunks: [{ content: text, score: 0, type: 'body' }],
        chunkCount: 1,
        inputTextLength,
        wasChunked: false,
      };
    }

    const lines = text.split('\n');
    const totalLines = lines.length;
    const firstPageEstimate = Math.min(
      totalLines,
      Math.ceil(totalLines * 0.15),
    ); // ~15% is "first page"

    const scoredLines: {
      line: string;
      score: number;
      type: DocumentChunk['type'];
    }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      let score = 0;
      let type: DocumentChunk['type'] = 'body';

      // Heading detection: ALL-CAPS short lines or markdown headings
      const isHeading =
        (trimmed.length < 80 &&
          trimmed === trimmed.toUpperCase() &&
          /[A-Z]{3,}/.test(trimmed)) ||
        /^#{1,3}\s/.test(trimmed);
      if (isHeading) {
        score += 40;
        type = 'heading';
      }

      // Keyword match
      const lowerLine = trimmed.toLowerCase();
      const hasKeyword = DocumentChunkingService.SECTION_KEYWORDS.some((kw) =>
        lowerLine.includes(kw.toLowerCase()),
      );
      if (hasKeyword) {
        score += 30;
        if (type === 'body') type = 'keyword';
      }

      // First-page positional bonus
      if (i < firstPageEstimate) {
        score += 10;
      }

      scoredLines.push({ line: trimmed, score, type });
    }

    // Build selected text: highest score first, fill from start for remainder
    const sorted = [...scoredLines].sort((a, b) => b.score - a.score);

    let selected = '';
    const includedLines = new Set<string>();

    for (const { line } of sorted) {
      if (selected.length + line.length + 1 > this.maxChars) break;
      selected += line + '\n';
      includedLines.add(line);
    }

    // Safety truncation
    if (selected.length > this.maxChars) {
      selected = selected.substring(0, this.maxChars);
    }

    const chunks: DocumentChunk[] = scoredLines
      .filter((sl) => includedLines.has(sl.line))
      .map((sl) => ({ content: sl.line, score: sl.score, type: sl.type }));

    const estimatedChunkCount = Math.ceil(inputTextLength / this.maxChars);

    return {
      selectedText: selected.trim(),
      chunks,
      chunkCount: estimatedChunkCount,
      inputTextLength,
      wasChunked: true,
    };
  }
}
