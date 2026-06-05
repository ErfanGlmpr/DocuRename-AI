import { MistralProvider } from './mistral.provider';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MistralProvider', () => {
  let provider: MistralProvider;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'MISTRAL_API_KEY') return 'test-key';
        if (key === 'MISTRAL_MODEL') return 'test-model';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;
    provider = new MistralProvider(mockConfigService);
    jest.clearAllMocks();
  });

  describe('extractDocumentMetadata', () => {
    it('should call Mistral with json_object and return parsed metadata', async () => {
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
      const body = callArgs[1] as { response_format: { type: string } };
      expect(body.response_format.type).toBe('json_object');
      expect(callArgs[2]?.headers?.['Authorization']).toBe('Bearer test-key');
    });
  });
});
