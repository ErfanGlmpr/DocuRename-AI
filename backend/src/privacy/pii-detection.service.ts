import { Injectable } from '@nestjs/common';
import { PiiEntity, PiiEntityType, PiiDetector } from './pii.types';
import { PII_PATTERNS, CONTEXT_LABELS } from './pii-patterns';

@Injectable()
export class PiiDetectionService implements PiiDetector {
  async detect(text: string): Promise<PiiEntity[]> {
    await Promise.resolve();
    const entities: PiiEntity[] = [];

    // 1. Regex based detection
    this.detectRegex(text, PII_PATTERNS.EMAIL, 'EMAIL', entities);
    this.detectRegex(text, PII_PATTERNS.PHONE, 'PHONE', entities);
    this.detectRegex(text, PII_PATTERNS.IBAN, 'IBAN', entities);
    this.detectRegex(text, PII_PATTERNS.CREDIT_CARD, 'CREDIT_CARD', entities);
    this.detectRegex(text, PII_PATTERNS.VAT_ID, 'VAT_ID', entities);
    this.detectRegex(text, PII_PATTERNS.TAX_ID, 'TAX_ID', entities);

    // 2. Context based detection
    this.detectWithContext(
      text,
      CONTEXT_LABELS.PERSON_NAME,
      'PERSON_NAME_BASIC',
      entities,
    );
    this.detectWithContext(
      text,
      CONTEXT_LABELS.ADDRESS,
      'ADDRESS_BASIC',
      entities,
    );
    this.detectWithContext(
      text,
      CONTEXT_LABELS.BANK_ACCOUNT,
      'BANK_ACCOUNT_BASIC',
      entities,
    );
    this.detectWithContext(
      text,
      CONTEXT_LABELS.DOB,
      'DATE_OF_BIRTH_BASIC',
      entities,
      PII_PATTERNS.DATE,
    );
    this.detectWithContext(
      text,
      CONTEXT_LABELS.ID_NUMBER,
      'GENERIC_ID_NUMBER',
      entities,
    );

    // 3. Resolve overlaps
    return this.resolveOverlaps(entities);
  }

  private detectRegex(
    text: string,
    pattern: RegExp,
    type: PiiEntityType,
    entities: PiiEntity[],
  ) {
    let match;
    const regex = new RegExp(pattern); // Clone to avoid state issues with /g
    while ((match = regex.exec(text)) !== null) {
      entities.push({
        type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.9,
        detector: 'regex',
      });
    }
  }

  private detectWithContext(
    text: string,
    labels: string[],
    type: PiiEntityType,
    entities: PiiEntity[],
    valuePattern?: RegExp,
  ) {
    for (const label of labels) {
      const labelRegex = new RegExp(`\\b${label}\\b[:\\-]?\\s*`, 'gi');
      let labelMatch;
      while ((labelMatch = labelRegex.exec(text)) !== null) {
        const afterLabel = text.slice(labelMatch.index + labelMatch[0].length);

        // For simple Phase 2, we take the rest of the line or until a reasonable delimiter
        let value = '';
        let start = labelMatch.index + labelMatch[0].length;

        if (valuePattern) {
          const vRegex = new RegExp(valuePattern);
          const vMatch = vRegex.exec(afterLabel);
          if (vMatch && vMatch.index < 20) {
            // Must be close to the label
            value = vMatch[0];
            start += vMatch.index;
          }
        } else {
          // Default: take until end of line or next label-like delimiter
          const lineEnd = afterLabel.indexOf('\n');
          const segment =
            lineEnd !== -1 ? afterLabel.slice(0, lineEnd) : afterLabel;
          value = segment.trim();
        }

        if (value && value.length > 0) {
          entities.push({
            type,
            value,
            start,
            end: start + value.length,
            confidence: 0.7,
            detector: 'context',
            context: label,
          });
        }
      }
    }
  }

  private resolveOverlaps(entities: PiiEntity[]): PiiEntity[] {
    if (entities.length === 0) return [];

    // Sort by start position
    entities.sort((a, b) => a.start - b.start || b.end - a.end);

    const result: PiiEntity[] = [];
    let current = entities[0];

    for (let i = 1; i < entities.length; i++) {
      const next = entities[i];

      if (next.start < current.end) {
        // Overlap detected
        if (this.shouldPrefer(next, current)) {
          current = next;
        }
      } else {
        result.push(current);
        current = next;
      }
    }
    result.push(current);

    return result;
  }

  private shouldPrefer(a: PiiEntity, b: PiiEntity): boolean {
    // 1. Prefer longer span
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenA > lenB) return true;
    if (lenB > lenA) return false;

    // 2. Prefer higher confidence
    if (a.confidence > b.confidence) return true;
    if (b.confidence > a.confidence) return false;

    // 3. Priority order
    const priority: PiiEntityType[] = [
      'IBAN',
      'CREDIT_CARD',
      'EMAIL',
      'PHONE',
      'VAT_ID',
      'TAX_ID',
      'BANK_ACCOUNT_BASIC',
      'DATE_OF_BIRTH_BASIC',
      'ADDRESS_BASIC',
      'PERSON_NAME_BASIC',
      'GENERIC_ID_NUMBER',
    ];

    return priority.indexOf(a.type) < priority.indexOf(b.type);
  }
}
