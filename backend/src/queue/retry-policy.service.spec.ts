import { Test, TestingModule } from '@nestjs/testing';
import { RetryPolicyService } from './retry-policy.service';
import { UnrecoverableError } from 'bullmq';

describe('RetryPolicyService', () => {
  let service: RetryPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetryPolicyService],
    }).compile();
    service = module.get<RetryPolicyService>(RetryPolicyService);
  });

  describe('isRetryable', () => {
    it('returns true for network errors', () => {
      expect(service.isRetryable(new Error('ECONNRESET'))).toBe(true);
      expect(service.isRetryable(new Error('fetch failed'))).toBe(true);
      expect(service.isRetryable(new Error('socket hang up'))).toBe(true);
    });

    it('returns true for provider 5xx errors', () => {
      expect(service.isRetryable(new Error('503 Service Unavailable'))).toBe(
        true,
      );
    });

    it('returns false for infected file errors', () => {
      expect(service.isRetryable(new Error('INFECTED:Eicar-Signature'))).toBe(
        false,
      );
      expect(service.isRetryable(new Error('virus detected'))).toBe(false);
    });

    it('returns false for invalid PDF errors', () => {
      expect(service.isRetryable(new Error('invalid pdf content'))).toBe(false);
      expect(service.isRetryable(new Error('No extractable text found'))).toBe(
        false,
      );
    });

    it('returns false for AbortError (user cancellation)', () => {
      expect(service.isRetryable(new Error('AbortError'))).toBe(false);
      expect(service.isRetryable(new Error('Stopped by user'))).toBe(false);
    });

    it('returns false for processing timeout', () => {
      expect(
        service.isRetryable(new Error('Processing timeout exceeded')),
      ).toBe(false);
    });

    it('returns false for validation failures', () => {
      expect(
        service.isRetryable(new Error('validation failed for field X')),
      ).toBe(false);
    });
  });

  describe('throwIfNonRetryable', () => {
    it('throws UnrecoverableError for non-retryable errors', () => {
      expect(() => {
        service.throwIfNonRetryable(new Error('INFECTED:TestVirus'));
      }).toThrow(UnrecoverableError);
    });

    it('does not throw for retryable errors', () => {
      expect(() => {
        service.throwIfNonRetryable(new Error('ECONNRESET'));
      }).not.toThrow();
    });
  });
});
