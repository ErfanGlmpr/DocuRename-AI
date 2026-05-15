import { z } from 'zod';

export const DocumentMetadataSchema = z.object({
  title: z.string(),
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
  documentDate: z.string().nullable(),
  issuer: z.string().nullable(),
  recipient: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  suggestedFilename: z.string().min(1),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

export interface AiProvider {
  name: string;
  extractDocumentMetadata(input: {
    text: string;
    originalFilename: string;
  }): Promise<DocumentMetadata>;
}
