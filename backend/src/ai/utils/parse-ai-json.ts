import {
  DocumentMetadata,
  DocumentMetadataSchema,
  TokenUsage,
} from '../ai.provider';

// ---------------------------------------------------------------------------
// JSON parsing & validation
// ---------------------------------------------------------------------------

/**
 * Parse raw AI text output into validated DocumentMetadata.
 *
 * Handles:
 * - Markdown code fences (```json ... ```)
 * - Leading/trailing whitespace
 * - Extra text before/after the JSON object
 *
 * Security: Do NOT log `raw` — it may contain document fragments.
 */
export function parseAiJson(raw: string): DocumentMetadata {
  let jsonStr = raw.trim();

  // 1. Strip markdown fences: ```json ... ``` or ``` ... ```
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // 2. Extract first JSON object if there's surrounding text
  if (!jsonStr.startsWith('{')) {
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  // 3. Parse JSON
  const parsed = JSON.parse(jsonStr) as unknown;

  // 4. Normalize category from array to string (LLMs sometimes return arrays)
  if (parsed && typeof parsed === 'object' && 'category' in parsed) {
    if (Array.isArray(parsed.category)) {
      parsed.category = parsed.category.length > 0 ? parsed.category[0] : null;
    }
  }

  // 5. Validate & normalize with Zod schema (includes .transform())
  return DocumentMetadataSchema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Error sanitization
// ---------------------------------------------------------------------------

/** Keys that must never appear in error messages */
const SENSITIVE_ERROR_KEYWORDS = [
  'api_key',
  'apikey',
  'api-key',
  'authorization',
  'bearer',
  'sk-',
  'password',
  'secret',
];

/**
 * Returns a safe, loggable error string that cannot leak API keys or document text.
 * Truncates long messages and removes known sensitive patterns.
 */
export function sanitizeAiError(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    return 'Unknown provider error';
  }

  // Remove anything that looks like a bearer token or API key
  message = message.replace(/bearer\s+\S+/gi, '[REDACTED]');
  message = message.replace(/sk-[A-Za-z0-9_-]{10,}/g, '[REDACTED]');

  // Check for known sensitive keywords and truncate aggressively
  const lower = message.toLowerCase();
  for (const kw of SENSITIVE_ERROR_KEYWORDS) {
    if (lower.includes(kw)) {
      return 'Provider configuration error (details redacted)';
    }
  }

  // Truncate to avoid leaking long document text in error messages
  const MAX_LEN = 300;
  if (message.length > MAX_LEN) {
    message = message.slice(0, MAX_LEN) + '…';
  }

  return message;
}

// ---------------------------------------------------------------------------
// Token usage extraction
// ---------------------------------------------------------------------------

export interface TokenUsageFieldMapping {
  promptTokens: string;
  completionTokens: string;
  totalTokens?: string;
}

/**
 * Extracts token usage from a provider response object using a field-name mapping.
 * Returns undefined if none of the fields are present.
 */
export function extractTokenUsage(
  data: unknown,
  mapping: TokenUsageFieldMapping,
): TokenUsage | undefined {
  if (!data || typeof data !== 'object') return undefined;

  const obj = data as Record<string, unknown>;

  const prompt =
    typeof obj[mapping.promptTokens] === 'number'
      ? (obj[mapping.promptTokens] as number)
      : 0;
  const completion =
    typeof obj[mapping.completionTokens] === 'number'
      ? (obj[mapping.completionTokens] as number)
      : 0;

  if (prompt === 0 && completion === 0) return undefined;

  const total =
    mapping.totalTokens && typeof obj[mapping.totalTokens] === 'number'
      ? (obj[mapping.totalTokens] as number)
      : prompt + completion;

  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
}
