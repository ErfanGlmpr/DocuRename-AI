import { OllamaProvider } from './ollama.provider';
import { ConfigService } from '@nestjs/config';
import { DocumentMetadata } from './ai.provider';

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
      "summary": "This is an invoice."
    }`;

    // Access private method using type assertion for testing
    const result = (
      provider as unknown as {
        parseAndValidate(s: string): DocumentMetadata;
      }
    ).parseAndValidate(validJson);
    expect(result.title).toBe('Test Invoice');
    expect(result.category).toBe('invoice');
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
      "summary": "Contract."
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
  });
});
