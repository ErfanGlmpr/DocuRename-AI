import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';

/**
 * RetryPolicyService — determines whether a job failure is worth retrying.
 *
 * BullMQ will throw an UnrecoverableError to signal "do not retry this job".
 *
 * Retryable (transient):
 *   - Network errors (ECONNRESET, ETIMEDOUT, fetch failed, etc.)
 *   - HTTP 429 / 503 from AI providers
 *   - Generic timeouts that are NOT the document-level timeout
 *
 * NOT retryable (permanent):
 *   - Infected documents (INFECTED error code)
 *   - Invalid / corrupt PDF
 *   - Validation failures
 *   - Document-level processing timeout (already marked terminal)
 *   - AbortError (user-cancelled)
 */
@Injectable()
export class RetryPolicyService {
  /** Permanent error message substrings — never retry these. */
  private static readonly NON_RETRYABLE_PATTERNS = [
    'INFECTED',
    'virus',
    'malware',
    'invalid pdf',
    'corrupt pdf',
    'no extractable text',
    'validation',
    'AbortError',
    'Stopped by user',
    'Processing timeout exceeded',
    'DOCUMENT_TIMEOUT',
    'invalid base64',
  ];

  /**
   * Returns true when the error represents a transient failure that may
   * succeed on a subsequent attempt.
   */
  isRetryable(error: unknown): boolean {
    const message = this.errorMessage(error).toLowerCase();

    for (const pattern of RetryPolicyService.NON_RETRYABLE_PATTERNS) {
      if (message.includes(pattern.toLowerCase())) {
        return false;
      }
    }
    return true;
  }

  /**
   * Throws an UnrecoverableError if the error should not be retried.
   * BullMQ catches this and moves the job directly to the failed state
   * without consuming any remaining retry attempts.
   *
   * Call this inside the job's catch block.
   */
  throwIfNonRetryable(error: unknown): void {
    if (!this.isRetryable(error)) {
      throw new UnrecoverableError(this.errorMessage(error));
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
  }
}
