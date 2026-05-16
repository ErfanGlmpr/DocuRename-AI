export type PiiEntityType =
  | 'EMAIL'
  | 'PHONE'
  | 'IBAN'
  | 'CREDIT_CARD'
  | 'TAX_ID'
  | 'VAT_ID'
  | 'PERSON_NAME_BASIC'
  | 'ADDRESS_BASIC'
  | 'DATE_OF_BIRTH_BASIC'
  | 'BANK_ACCOUNT_BASIC'
  | 'GENERIC_ID_NUMBER';

export interface PiiEntity {
  type: PiiEntityType;
  value: string;
  start: number;
  end: number;
  confidence: number;
  detector: string;
  context?: string;
}

export interface PiiDetector {
  detect(text: string): Promise<PiiEntity[]>;
}

export interface PiiTokenValue {
  type: PiiEntityType;
  originalValue: string;
  token: string;
  occurrences: number;
}

export interface RedactedPiiEntity {
  type: PiiEntityType;
  token: string;
  start: number;
  end: number;
  originalStart: number;
  originalEnd: number;
  confidence: number;
}

export interface RedactionInput {
  text: string;
  entities: PiiEntity[];
}

export interface RedactionOutput {
  redactedText: string;
  tokenMap: Record<string, PiiTokenValue>;
  entities: RedactedPiiEntity[];
}

export interface EncryptedPayload {
  algorithm: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}
