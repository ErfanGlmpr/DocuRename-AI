import { Test, TestingModule } from '@nestjs/testing';
import { PiiRedactionService } from './pii-redaction.service';
import { PiiEntity } from './pii.types';

describe('PiiRedactionService', () => {
  let service: PiiRedactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PiiRedactionService],
    }).compile();

    service = module.get<PiiRedactionService>(PiiRedactionService);
  });

  it('should redact multiple occurrences of the same value with the same token', async () => {
    const text = 'Contact john@example.com or john@example.com';
    const entities: PiiEntity[] = [
      {
        type: 'EMAIL',
        value: 'john@example.com',
        start: 8,
        end: 24,
        confidence: 0.9,
        detector: 'test',
      },
      {
        type: 'EMAIL',
        value: 'john@example.com',
        start: 28,
        end: 44,
        confidence: 0.9,
        detector: 'test',
      },
    ];

    const result = await service.redact({ text, entities });
    expect(result.redactedText).toBe('Contact [EMAIL_1] or [EMAIL_1]');
    expect(result.tokenMap['[EMAIL_1]']).toBeDefined();
    expect(result.tokenMap['[EMAIL_1]'].occurrences).toBe(2);
  });

  it('should preserve non-PII text and handle multiple types', async () => {
    const text = 'User John Smith (john@example.com) called 555-0100';
    const entities: PiiEntity[] = [
      {
        type: 'PERSON_NAME_BASIC',
        value: 'John Smith',
        start: 5,
        end: 15,
        confidence: 0.7,
        detector: 'test',
      },
      {
        type: 'EMAIL',
        value: 'john@example.com',
        start: 17,
        end: 33,
        confidence: 0.9,
        detector: 'test',
      },
      {
        type: 'PHONE',
        value: '555-0100',
        start: 42,
        end: 50,
        confidence: 0.9,
        detector: 'test',
      },
    ];

    const result = await service.redact({ text, entities });
    expect(result.redactedText).toContain('User [PERSON_1]');
    expect(result.redactedText).toContain('([EMAIL_1])');
    expect(result.redactedText).toContain('called [PHONE_1]');
    expect(Object.keys(result.tokenMap).length).toBe(3);
  });

  it('should avoid index corruption by replacing from the end', async () => {
    const text = 'AAA BBB CCC';
    const entities: PiiEntity[] = [
      {
        type: 'GENERIC_ID_NUMBER',
        value: 'AAA',
        start: 0,
        end: 3,
        confidence: 0.5,
        detector: 'test',
      },
      {
        type: 'GENERIC_ID_NUMBER',
        value: 'BBB',
        start: 4,
        end: 7,
        confidence: 0.5,
        detector: 'test',
      },
    ];

    // If it replaces AAA first, BBB's start index (4) would be wrong if token length !== 3.
    // By replacing from end, it stays safe.
    const result = await service.redact({ text, entities });
    expect(result.redactedText).toBe('[ID_NUMBER_2] [ID_NUMBER_1] CCC');
  });
});
