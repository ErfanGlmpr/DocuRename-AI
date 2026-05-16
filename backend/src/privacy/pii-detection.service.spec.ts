import { Test, TestingModule } from '@nestjs/testing';
import { PiiDetectionService } from './pii-detection.service';

describe('PiiDetectionService', () => {
  let service: PiiDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PiiDetectionService],
    }).compile();

    service = module.get<PiiDetectionService>(PiiDetectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should detect email', async () => {
    const text = 'My email is john.doe@example.com';
    const entities = await service.detect(text);
    expect(entities).toContainEqual(
      expect.objectContaining({
        type: 'EMAIL',
        value: 'john.doe@example.com',
      }),
    );
  });

  it('should detect phone number', async () => {
    const text = 'Call me at +1 555-0123-4567';
    const entities = await service.detect(text);
    expect(entities).toContainEqual(
      expect.objectContaining({
        type: 'PHONE',
        value: '+1 555-0123-4567',
      }),
    );
  });

  it('should detect IBAN', async () => {
    const text = 'IBAN: DE12345678901234567890';
    const entities = await service.detect(text);
    expect(entities).toContainEqual(
      expect.objectContaining({
        type: 'IBAN',
        value: 'DE12345678901234567890',
      }),
    );
  });

  it('should detect credit card', async () => {
    const text = 'Card number: 4111 1111 1111 1111';
    const entities = await service.detect(text);
    expect(entities).toContainEqual(
      expect.objectContaining({
        type: 'CREDIT_CARD',
        value: '4111 1111 1111 1111',
      }),
    );
  });

  it('should detect person name with context', async () => {
    const text = 'Customer: John Smith\nRecipient: Jane Doe';
    const entities = await service.detect(text);
    expect(entities).toContainEqual(
      expect.objectContaining({
        type: 'PERSON_NAME_BASIC',
        value: 'John Smith',
      }),
    );
    expect(entities).toContainEqual(
      expect.objectContaining({
        type: 'PERSON_NAME_BASIC',
        value: 'Jane Doe',
      }),
    );
  });

  it('should detect address with context', async () => {
    const text = 'Billing Address: 123 Main St, Springfield, IL 62704';
    const entities = await service.detect(text);
    expect(entities).toContainEqual(
      expect.objectContaining({
        type: 'ADDRESS_BASIC',
        value: '123 Main St, Springfield, IL 62704',
      }),
    );
  });

  it('should resolve overlaps preferring longer span', async () => {
    // Overlapping phone and generic ID (hypothetical)
    const text = '1234567890';
    // If multiple detectors catch this, resolveOverlaps should pick one
    const entities = await service.detect(text);
    expect(entities.length).toBeLessThanOrEqual(1);
  });
});
