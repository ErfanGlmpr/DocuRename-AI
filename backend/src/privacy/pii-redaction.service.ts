import { Injectable } from '@nestjs/common';
import {
  PiiEntityType,
  PiiTokenValue,
  RedactedPiiEntity,
  RedactionInput,
  RedactionOutput,
} from './pii.types';

@Injectable()
export class PiiRedactionService {
  async redact(input: RedactionInput): Promise<RedactionOutput> {
    await Promise.resolve();
    const { text, entities } = input;

    // 1. Deduplicate entities by value to reuse tokens
    const valueToToken: Record<string, string> = {};
    const typeCounters: Record<string, number> = {};

    const sortedEntities = [...entities].sort((a, b) => b.start - a.start); // Replace from end to avoid index shift

    const tokenMap: Record<string, PiiTokenValue> = {};
    const redactedEntities: RedactedPiiEntity[] = [];

    let redactedText = text;

    for (const entity of sortedEntities) {
      let token = valueToToken[entity.value];

      if (!token) {
        const typePrefix = this.getPrefixForType(entity.type);
        typeCounters[entity.type] = (typeCounters[entity.type] || 0) + 1;
        token = `[${typePrefix}_${typeCounters[entity.type]}]`;
        valueToToken[entity.value] = token;

        tokenMap[token] = {
          type: entity.type,
          originalValue: entity.value,
          token,
          occurrences: 0,
        };
      }

      tokenMap[token].occurrences++;

      redactedText =
        redactedText.slice(0, entity.start) +
        token +
        redactedText.slice(entity.end);
      // offset calculation removed as it was unused

      redactedEntities.push({
        type: entity.type,
        token,
        start: entity.start,
        end: entity.start + token.length,
        originalStart: entity.start,
        originalEnd: entity.end,
        confidence: entity.confidence,
      });
    }

    // Since we redacted from end to start, the redactedEntities are also in reverse order.
    // Let's re-sort them for consistency.
    redactedEntities.sort((a, b) => a.start - b.start);

    return {
      redactedText,
      tokenMap,
      entities: redactedEntities,
    };
  }

  private getPrefixForType(type: PiiEntityType): string {
    switch (type) {
      case 'EMAIL':
        return 'EMAIL';
      case 'PHONE':
        return 'PHONE';
      case 'IBAN':
        return 'IBAN';
      case 'CREDIT_CARD':
        return 'CREDIT_CARD';
      case 'VAT_ID':
        return 'VAT_ID';
      case 'TAX_ID':
        return 'TAX_ID';
      case 'PERSON_NAME_BASIC':
        return 'PERSON';
      case 'ADDRESS_BASIC':
        return 'ADDRESS';
      case 'DATE_OF_BIRTH_BASIC':
        return 'DOB';
      case 'BANK_ACCOUNT_BASIC':
        return 'BANK_ACCOUNT';
      case 'GENERIC_ID_NUMBER':
        return 'ID_NUMBER';
      default:
        return 'ENTITY';
    }
  }
}
