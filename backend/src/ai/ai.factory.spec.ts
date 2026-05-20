import { AiProviderFactory } from './ai.factory';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from './ai.provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { MistralProvider } from './providers/mistral.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

describe('AiProviderFactory', () => {
  let factory: AiProviderFactory;
  let mockConfigService: jest.Mocked<ConfigService>;

  // Mock providers
  const mockOllama = {
    name: 'ollama',
    model: 'default',
  } as unknown as AiProvider;
  const mockOpenAi = {
    name: 'openai',
    model: 'default',
  } as unknown as AiProvider;
  const mockAnthropic = {
    name: 'anthropic',
    model: 'default',
  } as unknown as AiProvider;
  const mockGemini = {
    name: 'gemini',
    model: 'default',
  } as unknown as AiProvider;
  const mockMistral = {
    name: 'mistral',
    model: 'default',
  } as unknown as AiProvider;
  const mockOpenAiCompatible = {
    name: 'openai-compatible',
    model: 'default',
  } as unknown as AiProvider;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    factory = new AiProviderFactory(
      mockConfigService,
      mockOllama as unknown as OllamaProvider,
      mockOpenAi as unknown as OpenAiProvider,
      mockAnthropic as unknown as AnthropicProvider,
      mockGemini as unknown as GeminiProvider,
      mockMistral as unknown as MistralProvider,
      mockOpenAiCompatible as unknown as OpenAiCompatibleProvider,
    );
  });

  describe('getProvider', () => {
    it('should return ollama by default if AI_PROVIDER is not set', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const provider = factory.getProvider();
      expect(provider.name).toBe('ollama');
    });

    it('should return the correct provider based on AI_PROVIDER env', () => {
      mockConfigService.get.mockReturnValue('openai');
      expect(factory.getProvider().name).toBe('openai');

      mockConfigService.get.mockReturnValue('anthropic');
      expect(factory.getProvider().name).toBe('anthropic');

      mockConfigService.get.mockReturnValue('gemini');
      expect(factory.getProvider().name).toBe('gemini');
    });

    it('should throw an error for unknown providers instead of falling back silently', () => {
      mockConfigService.get.mockReturnValue('unknown-provider');
      expect(() => factory.getProvider()).toThrow(/Unknown AI provider/);
    });
  });

  describe('getFallbackProvider', () => {
    it('should return null if fallback is not enabled', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'AI_ENABLE_PROVIDER_FALLBACK') return 'false';
        return undefined;
      });
      expect(factory.getFallbackProvider()).toBeNull();
    });

    it('should return the configured fallback provider when enabled', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'AI_ENABLE_PROVIDER_FALLBACK') return 'true';
        if (key === 'AI_FALLBACK_PROVIDER') return 'mistral';
        return undefined;
      });
      const fallback = factory.getFallbackProvider();
      expect(fallback).not.toBeNull();
      expect(fallback?.name).toBe('mistral');
    });
  });

  describe('getProviderByName', () => {
    it('should return the requested provider instance', () => {
      expect(factory.getProviderByName('openai-compatible').name).toBe(
        'openai-compatible',
      );
    });

    it('should throw for unknown provider names', () => {
      expect(() => factory.getProviderByName('invalid')).toThrow(
        /Unknown AI provider/,
      );
    });
  });
});
