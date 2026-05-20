/* eslint-disable @typescript-eslint/unbound-method */
import { OpenAiProvider } from './openai.provider';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAiProvider', () => {
  let provider: OpenAiProvider;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-key';
        if (key === 'OPENAI_MODEL') return 'test-model';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;
    provider = new OpenAiProvider(mockConfigService);
    jest.clearAllMocks();
  });

  describe('extractDocumentMetadata', () => {
    it('should call OpenAI with json_schema and return parsed metadata', async () => {
      const mockResponse = {
        title: 'Test Doc',
        category: 'invoice',
        documentDate: '2025-01-01',
        issuer: null,
        recipient: null,
        referenceNumber: null,
        suggestedFilename: 'test.pdf',
        confidence: 0.9,
        summary: 'sum',
        language: 'en',
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      });

      const result = await provider.extractDocumentMetadata({
        text: 'hello',
        originalFilename: 'test.pdf',
      });

      expect(result.metadata.title).toBe('Test Doc');
      expect(result.tokenUsage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[0]).toContain('/chat/completions');
      const body = callArgs[1] as {
        model: string;
        response_format: { type: string };
      };
      expect(body.model).toBe('test-model');
      expect(body.response_format.type).toBe('json_schema');
      // Ensure API key is in headers, not URL
      expect(callArgs[2]?.headers?.['Authorization']).toBe('Bearer test-key');
    });

    it('should fallback to json_object on first parse failure', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({
          data: { choices: [{ message: { content: 'invalid json' } }] },
        })
        .mockResolvedValueOnce({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'Fallback',
                    category: 'invoice',
                    suggestedFilename: 'a.pdf',
                    confidence: 1,
                    summary: 'a',
                    language: 'en',
                  }),
                },
              },
            ],
          },
        });

      const result = await provider.extractDocumentMetadata({
        text: 'hello',
        originalFilename: 'test.pdf',
      });

      expect(result.metadata.title).toBe('Fallback');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      const body2 = mockedAxios.post.mock.calls[1][1] as {
        response_format: { type: string };
      };
      expect(body2.response_format.type).toBe('json_object');
    });
  });

  describe('healthCheck', () => {
    it('should return ok=true when ping succeeds', async () => {
      mockedAxios.post.mockResolvedValueOnce({});
      const result = await provider.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('should return ok=false and sanitized error on failure', async () => {
      mockedAxios.post.mockRejectedValueOnce(
        new Error('Auth failed: Bearer sk-secret'),
      );
      const result = await provider.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.errorMessage).not.toContain('sk-secret');
    });
  });
});
