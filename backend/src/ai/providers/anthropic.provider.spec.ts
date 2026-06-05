import { AnthropicProvider } from './anthropic.provider';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'test-key';
        if (key === 'ANTHROPIC_MODEL') return 'test-model';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;
    provider = new AnthropicProvider(mockConfigService);
    jest.clearAllMocks();
  });

  describe('extractDocumentMetadata', () => {
    it('should call Anthropic with tool use and return parsed metadata', async () => {
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
          content: [
            { type: 'text', text: 'Here is the extraction:' },
            {
              type: 'tool_use',
              name: 'extract_document_metadata',
              input: mockResponse,
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
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
      expect(callArgs[0]).toContain('/v1/messages');
      const body = callArgs[1] as { tools: { name: string }[] };
      expect(body.tools[0].name).toBe('extract_document_metadata');
      expect(callArgs[2]?.headers?.['x-api-key']).toBe('test-key');
    });
  });
});
