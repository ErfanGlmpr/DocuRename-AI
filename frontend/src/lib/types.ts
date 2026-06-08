export interface User {
  id: string;
  email: string;
  name?: string;
  organizationId: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string[];
  error: string;
  requestId: string;
}

export type DocumentStatus =
  | 'QUEUED'
  | 'EXTRACTING_TEXT'
  | 'ANALYZING_WITH_AI'
  | 'RENAMING'
  | 'NEEDS_REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export interface Document {
  id: string;
  originalName: string;
  finalName: string | null;
  generatedName: string | null;
  status: DocumentStatus;
  pageCount: number;
  category: string | null;
  confidence: number | null;
  createdAt: string;
  errorMessage: string | null;
  piiDetected: boolean;
  piiEntityCount: number;
  privacyMode: string;
  aiInputMode: string;
  piiProcessedAt: string | null;
  processingDuration: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}
