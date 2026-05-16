import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KEYWORDS } from '../../privacy/pii-patterns';

export interface MinimizationResult {
  minimizedText: string;
  originalLength: number;
  minimizedLength: number;
  strategy: 'first_chars_with_keyword_lines';
}

@Injectable()
export class PromptMinimizationService {
  private readonly maxChars: number;

  constructor(private configService: ConfigService) {
    this.maxChars = parseInt(
      this.configService.get('AI_INPUT_MAX_CHARS') || '12000',
      10,
    );
  }

  minimize(text: string): MinimizationResult {
    const originalLength = text.length;

    if (originalLength <= this.maxChars) {
      return {
        minimizedText: text,
        originalLength,
        minimizedLength: originalLength,
        strategy: 'first_chars_with_keyword_lines',
      };
    }

    const lines = text.split('\n');
    const scoredLines: { line: string; score: number }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let score = 0;

      // Keyword match = high priority
      const hasKeyword = KEYWORDS.some((kw) =>
        trimmed.toLowerCase().includes(kw.toLowerCase()),
      );
      if (hasKeyword) score += 10;

      // Heading-like (short, uppercase-ish) = medium
      if (trimmed.length < 50 && trimmed === trimmed.toUpperCase()) score += 5;

      // Long repeated empty = skip (already skipped by trimmed check)

      scoredLines.push({ line: trimmed, score });
    }

    // Deduplicate consecutive short lines if needed (simplified for Phase 2)
    const filteredLines = scoredLines.filter(
      (sl) => sl.line.length > 2 || sl.score > 0,
    );

    // Build output: take high-priority lines first, then fill from start
    let resultText = '';

    // 1. Take high-priority lines (score >= 10)
    const priorityLines = filteredLines
      .filter((sl) => sl.score >= 10)
      .map((sl) => sl.line);
    resultText = priorityLines.join('\n');

    if (resultText.length < this.maxChars) {
      // 2. Fill remainder from document start
      const remainingChars = this.maxChars - resultText.length - 1;
      const otherLines = filteredLines
        .filter((sl) => sl.score < 10)
        .map((sl) => sl.line);

      let fillText = '';
      for (const line of otherLines) {
        if (fillText.length + line.length + 1 <= remainingChars) {
          fillText += line + '\n';
        } else {
          break;
        }
      }

      resultText = resultText + '\n---\n' + fillText;
    }

    // Final safety truncation
    if (resultText.length > this.maxChars) {
      resultText = resultText.substring(0, this.maxChars);
    }

    return {
      minimizedText: resultText,
      originalLength,
      minimizedLength: resultText.length,
      strategy: 'first_chars_with_keyword_lines',
    };
  }
}
