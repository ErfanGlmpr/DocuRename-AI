import {
  parseAiJson,
  sanitizeAiError,
  extractTokenUsage,
} from './parse-ai-json';

describe('AI JSON Utilities', () => {
  describe('parseAiJson', () => {
    it('should parse clean JSON', () => {
      const valid = {
        title: 'Test',
        category: 'invoice',
        documentDate: '2025-01-01',
        issuer: null,
        recipient: null,
        referenceNumber: null,
        suggestedFilename: 'test.pdf',
        confidence: 0.9,
        summary: 'Test summary',
        language: 'en',
      };
      const result = parseAiJson(JSON.stringify(valid));
      expect(result.title).toBe('Test');
      expect(result.category).toBe('invoice');
    });

    it('should parse markdown-wrapped JSON', () => {
      const raw = `
        Here is the JSON:
        \`\`\`json
        {
          "title": "Wrapped",
          "category": "contract",
          "documentDate": null,
          "issuer": null,
          "recipient": null,
          "referenceNumber": null,
          "suggestedFilename": "contract.pdf",
          "confidence": 0.5,
          "summary": "Summary",
          "language": "en"
        }
        \`\`\`
      `;
      const result = parseAiJson(raw);
      expect(result.title).toBe('Wrapped');
      expect(result.category).toBe('contract');
    });

    it('should normalize documentDate and suggestedFilename', () => {
      const valid = {
        title: 'Normalize',
        category: 'other',
        documentDate: '2025-05-20T14:00:00.000Z',
        issuer: null,
        recipient: null,
        referenceNumber: null,
        suggestedFilename: 'no-extension',
        confidence: 0.1,
        summary: 'Sum',
        language: 'en',
      };
      const result = parseAiJson(JSON.stringify(valid));
      expect(result.documentDate).toBe('2025-05-20');
      expect(result.suggestedFilename).toBe('no-extension.pdf');
    });

    it('should throw on invalid schema', () => {
      expect(() => parseAiJson('{"title": "missing-category"}')).toThrow();
    });
  });

  describe('sanitizeAiError', () => {
    it('should redact Bearer tokens and API keys', () => {
      const err = new Error('Failed to auth: Bearer sk-1234567890abcdef');
      const safe = sanitizeAiError(err);
      expect(safe).toContain('[REDACTED]');
      expect(safe).not.toContain('sk-');
    });

    it('should return a safe string for non-error objects', () => {
      expect(sanitizeAiError({ foo: 'bar' })).toBe('Unknown provider error');
    });

    it('should truncate very long messages', () => {
      const longMessage = 'A'.repeat(500);
      const safe = sanitizeAiError(new Error(longMessage));
      expect(safe.length).toBeLessThan(310);
      expect(safe.endsWith('…')).toBe(true);
    });
  });

  describe('extractTokenUsage', () => {
    it('should extract correctly mapped tokens', () => {
      const data = { p_tok: 10, c_tok: 20 };
      const usage = extractTokenUsage(data, {
        promptTokens: 'p_tok',
        completionTokens: 'c_tok',
      });
      expect(usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });

    it('should return undefined if tokens are missing', () => {
      expect(
        extractTokenUsage({}, { promptTokens: 'p', completionTokens: 'c' }),
      ).toBeUndefined();
    });
  });
});
