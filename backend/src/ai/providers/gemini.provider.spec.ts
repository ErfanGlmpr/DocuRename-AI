import { GeminiProvider } from './gemini.provider';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'test-key';
        if (key === 'GEMINI_MODEL') return 'test-model';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;
    provider = new GeminiProvider(mockConfigService);
    jest.clearAllMocks();
  });

  describe('extractDocumentMetadata', () => {
    it('should call Gemini with responseSchema and return parsed metadata', async () => {
      const mockResponse = {
        title: 'Test Doc',
        category: 'invoice',
        suggestedFilename: 'test.pdf',
        confidence: 0.9,
        summary: 'sum',
        language: 'en',
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          candidates: [
            { content: { parts: [{ text: JSON.stringify(mockResponse) }] } },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
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
      expect(callArgs[0]).toContain('key=test-key');
      const body = callArgs[1] as {
        generationConfig: { responseSchema: unknown };
      };
      expect(body.generationConfig.responseSchema).toBeDefined();
    });
  });
});
