/**
 * JSON Schema representation of DocumentMetadataSchema.
 * Used by providers that support schema-based structured output
 * (OpenAI json_schema mode, Gemini responseSchema, etc.).
 *
 * Must stay in sync with DocumentMetadataSchema in ai.provider.ts.
 */
export const DOCUMENT_METADATA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      description: 'A clear, professional title for the document.',
    },
    category: {
      type: 'string',
      enum: [
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
      ],
      description: 'Document category.',
    },
    documentDate: {
      type: ['string', 'null'],
      description: 'ISO 8601 date (YYYY-MM-DD) or null.',
    },
    issuer: {
      type: ['string', 'null'],
      description: 'Entity that issued the document or null.',
    },
    recipient: {
      type: ['string', 'null'],
      description: 'Entity receiving the document or null.',
    },
    referenceNumber: {
      type: ['string', 'null'],
      description: 'Invoice / reference number or null.',
    },
    suggestedFilename: {
      type: 'string',
      minLength: 1,
      description: 'Safe filename ending in .pdf.',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Extraction confidence score 0–1.',
    },
    summary: {
      type: 'string',
      description: 'A concise 1-sentence summary of the document.',
    },
    language: {
      type: 'string',
      description: "ISO 639-1 two-letter language code, e.g. 'en', 'de'.",
    },
  },
  required: [
    'title',
    'category',
    'documentDate',
    'issuer',
    'recipient',
    'referenceNumber',
    'suggestedFilename',
    'confidence',
    'summary',
    'language',
  ],
  additionalProperties: false,
} as const;

/**
 * OpenAI-style json_schema wrapper.
 * Pass this to `response_format.json_schema` in OpenAI / Mistral / compatible APIs.
 */
export const OPENAI_JSON_SCHEMA_WRAPPER = {
  name: 'document_metadata',
  description: 'Structured metadata extracted from a document.',
  strict: true,
  schema: DOCUMENT_METADATA_JSON_SCHEMA,
} as const;
