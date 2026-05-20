import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDocumentDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Try to parse and re-format
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // fall through
  }
  return null;
}

function normalizeSuggestedFilename(value: string): string {
  if (!value.toLowerCase().endsWith('.pdf')) {
    return value + '.pdf';
  }
  return value;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const DocumentMetadataSchema = z
  .object({
    title: z.string().min(1),
    category: z.enum([
      'invoice',
      'contract',
      'receipt',
      'bank_statement',
      'tax_document',
      'legal_document',
      'medical_document',
      'resume',
      'report',
      'other',
    ]),
    documentDate: z.string().nullable().optional(),
    issuer: z.string().nullable().optional(),
    recipient: z.string().nullable().optional(),
    referenceNumber: z.string().nullable().optional(),
    suggestedFilename: z.string().min(1),
    confidence: z.number().min(0).max(1),
    summary: z.string(),
    language: z.string().default('en'),
  })
  .transform((data) => ({
    ...data,
    documentDate: normalizeDocumentDate(data.documentDate ?? null),
    issuer: data.issuer ?? null,
    recipient: data.recipient ?? null,
    referenceNumber: data.referenceNumber ?? null,
    suggestedFilename: normalizeSuggestedFilename(data.suggestedFilename),
  }));

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

// ---------------------------------------------------------------------------
// Token usage
// ---------------------------------------------------------------------------

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Extraction result
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  metadata: DocumentMetadata;
  tokenUsage?: TokenUsage;
}

// ---------------------------------------------------------------------------
// Provider health
// ---------------------------------------------------------------------------

export interface AiProviderHealth {
  provider: string;
  model: string;
  ok: boolean;
  latencyMs?: number;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface AiProvider {
  /** Provider name, e.g. "ollama", "openai", "anthropic" */
  name: string;

  /** Active model name (may differ from default if override applied) */
  model: string;

  extractDocumentMetadata(
    input: {
      text: string;
      originalFilename: string;
      /** Optional per-request model override. Does NOT mutate provider state. */
      modelOverride?: string;
    },
    signal?: AbortSignal,
  ): Promise<ExtractionResult>;

  /** Optional connectivity check. Must not send document content. */
  healthCheck?(): Promise<AiProviderHealth>;
}
