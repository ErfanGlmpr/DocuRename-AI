import { OllamaProvider } from './ollama.provider';
import { ConfigService } from '@nestjs/config';
import { DocumentMetadata } from './ai.provider';
import axios from 'axios';

describe('OllamaProvider JSON parsing', () => {
  let provider: OllamaProvider;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(''),
    };
    provider = new OllamaProvider(mockConfigService as ConfigService);
  });

  it('should parse valid JSON', () => {
    const validJson = `
    {
      "title": "Test Invoice",
      "category": "invoice",
      "documentDate": "2025-01-01",
      "issuer": "Acme",
      "recipient": "Us",
      "referenceNumber": "INV-123",
      "suggestedFilename": "acme-invoice.pdf",
      "confidence": 0.95,
      "summary": "This is an invoice.",
      "language": "de"
    }`;

    // Access private method using type assertion for testing
    const result = (
      provider as unknown as {
        parseAndValidate(s: string): DocumentMetadata;
      }
    ).parseAndValidate(validJson);
    expect(result.title).toBe('Test Invoice');
    expect(result.category).toBe('invoice');
    expect(result.language).toBe('de');
  });

  it('should parse markdown-wrapped JSON', () => {
    const markdownJson = `
    Here is the requested metadata:
    \`\`\`json
    {
      "title": "Test Contract",
      "category": "contract",
      "documentDate": null,
      "issuer": null,
      "recipient": null,
      "referenceNumber": null,
      "suggestedFilename": "contract.pdf",
      "confidence": 0.8,
      "summary": "Contract.",
      "language": "en"
    }
    \`\`\`
    Have a nice day!
    `;

    const result = (
      provider as unknown as {
        parseAndValidate(s: string): DocumentMetadata;
      }
    ).parseAndValidate(markdownJson);
    expect(result.title).toBe('Test Contract');
    expect(result.category).toBe('contract');
    expect(result.language).toBe('en');
  });

  describe('extractDocumentMetadata with Token Tracking', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should record and return token counts on a single successful call', async () => {
      const validJson = JSON.stringify({
        title: 'Test Invoice',
        category: 'invoice',
        documentDate: '2025-01-01',
        issuer: 'Acme',
        recipient: 'Us',
        referenceNumber: 'INV-123',
        suggestedFilename: 'acme-invoice.pdf',
        confidence: 0.95,
        summary: 'This is an invoice.',
        language: 'de',
      });

      jest.spyOn(axios, 'post').mockResolvedValue({
        data: {
          response: validJson,
          prompt_eval_count: 120,
          eval_count: 65,
        },
      });

      const result = await provider.extractDocumentMetadata({
        text: 'dummy text',
        originalFilename: 'test.pdf',
      });

      expect(result.metadata.title).toBe('Test Invoice');
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.promptTokens).toBe(120);
      expect(result.tokenUsage?.completionTokens).toBe(65);
      expect(result.tokenUsage?.totalTokens).toBe(185);
    });

    it('should accumulate token counts across multiple calls when a JSON validation retry occurs', async () => {
      const invalidJson = 'This is not JSON';
      const validJson = JSON.stringify({
        title: 'Repaired Invoice',
        category: 'invoice',
        documentDate: '2025-01-01',
        issuer: 'Acme',
        recipient: 'Us',
        referenceNumber: 'INV-123',
        suggestedFilename: 'repaired-invoice.pdf',
        confidence: 0.9,
        summary: 'Repaired invoice.',
        language: 'en',
      });

      // Spy on axios.post and return invalid first, then valid second
      const postSpy = jest.spyOn(axios, 'post');
      postSpy
        .mockResolvedValueOnce({
          data: {
            response: invalidJson,
            prompt_eval_count: 100,
            eval_count: 30,
          },
        })
        .mockResolvedValueOnce({
          data: {
            response: validJson,
            prompt_eval_count: 220,
            eval_count: 85,
          },
        });

      const result = await provider.extractDocumentMetadata({
        text: 'dummy text',
        originalFilename: 'test.pdf',
      });

      expect(result.metadata.title).toBe('Repaired Invoice');
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.promptTokens).toBe(320); // 100 + 220
      expect(result.tokenUsage?.completionTokens).toBe(115); // 30 + 85
      expect(result.tokenUsage?.totalTokens).toBe(435); // 320 + 115
      expect(postSpy).toHaveBeenCalledTimes(2);
    });
  });
});
