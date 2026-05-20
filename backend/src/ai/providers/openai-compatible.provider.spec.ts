/* eslint-disable @typescript-eslint/unbound-method */
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAiCompatibleProvider', () => {
  let provider: OpenAiCompatibleProvider;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_COMPATIBLE_API_KEY') return 'test-key';
        if (key === 'OPENAI_COMPATIBLE_MODEL') return 'test-model';
        if (key === 'OPENAI_COMPATIBLE_BASE_URL') return 'http://test:8000/v1';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;
    provider = new OpenAiCompatibleProvider(mockConfigService);
    jest.clearAllMocks();
  });

  describe('extractDocumentMetadata', () => {
    it('should degrade gracefully through strategies until one works', async () => {
      // 1: json_schema fails
      mockedAxios.post.mockRejectedValueOnce(
        new Error('json_schema not supported'),
      );
      // 2: json_object fails
      mockedAxios.post.mockResolvedValueOnce({
        data: { choices: [{ message: { content: 'invalid json string' } }] },
      });
      // 3: plain prompt succeeds
      const mockResponse = {
        title: 'Plain',
        category: 'invoice',
        suggestedFilename: 'plain.pdf',
        confidence: 0.9,
        summary: 'sum',
        language: 'en',
      };
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        },
      });

      const result = await provider.extractDocumentMetadata({
        text: 'hello',
        originalFilename: 'test.pdf',
      });

      expect(result.metadata.title).toBe('Plain');
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);

      const callArgs1 = mockedAxios.post.mock.calls[0];
      const callArgs2 = mockedAxios.post.mock.calls[1];
      const callArgs3 = mockedAxios.post.mock.calls[2];

      const body1 = callArgs1[1] as { response_format: { type: string } };
      const body2 = callArgs2[1] as { response_format: { type: string } };
      const body3 = callArgs3[1] as { response_format?: { type: string } };

      expect(body1.response_format.type).toBe('json_schema');
      expect(body2.response_format.type).toBe('json_object');
      expect(body3.response_format).toBeUndefined();
    });
  });
});
