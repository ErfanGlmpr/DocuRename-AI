/**
 * Shared prompt builders used by every AI provider.
 *
 * Security rules enforced here:
 * - Do NOT log the output of these functions.
 * - Do NOT include raw extracted text; the caller must pass already-minimized text.
 */

const CATEGORY_VALUES = [
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
] as const;

/**
 * System-level instruction for document metadata extraction.
 * Identical across all providers — ensures consistent output expectations.
 */
export function buildDocumentMetadataSystemPrompt(): string {
  return `### TASK
Extract structured metadata from the document text provided by the user.
The document may contain privacy placeholders like [PERSON_1], [ADDRESS_1], [VAT_ID_1], etc. Treat these as actual names or identifiers.

### OUTPUT FORMAT
Return ONLY a valid JSON object matching the schema below. No preamble, no markdown, no explanation.
IMPORTANT: You MUST start your response directly with '{' and end with '}'. Do NOT wrap your output in markdown code blocks like \`\`\`json or similar.

### SCHEMA
{
  "title": "A clear, professional title for the document",
  "category": "${CATEGORY_VALUES.join(' | ')}",
  "documentDate": "ISO 8601 date string (YYYY-MM-DD) or null",
  "issuer": "Entity that issued the document (e.g., GASAG) or null",
  "recipient": "Entity receiving the document or null",
  "referenceNumber": "Invoice number, customer ID, or reference ID or null",
  "suggestedFilename": "A concise, safe filename ending in .pdf (e.g., 2026-01-16_GASAG_Stromrechnung.pdf)",
  "confidence": "A number between 0.0 and 1.0 (ignore redaction when scoring)",
  "summary": "A concise 1-sentence summary",
  "language": "ISO 639-1 two-letter language code for the primary language of the document (e.g., 'de', 'en', 'fr', 'es'). Default to 'en' if unsure."
}`;
}

/**
 * User-facing prompt containing the document context.
 * Never log the output of this function.
 */
export function buildDocumentMetadataUserPrompt(input: {
  text: string;
  originalFilename: string;
}): string {
  return `### CONTEXT
Original Filename: "${input.originalFilename}"

### DOCUMENT TEXT
${input.text}
`;
}

/**
 * Repair prompt when initial JSON parsing fails.
 * References the failed output and error but does NOT re-include the document text.
 */
export function buildRepairPrompt(failedOutput: string, error: string): string {
  return `The following JSON was invalid or failed schema validation:
${failedOutput}

Error: ${error}

Please return ONLY valid JSON matching the schema exactly. Start with { and end with }.`;
}
