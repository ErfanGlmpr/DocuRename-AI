import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from './ai.provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { MistralProvider } from './providers/mistral.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

const SUPPORTED_PROVIDERS = [
  'ollama',
  'openai',
  'anthropic',
  'gemini',
  'mistral',
  'openai-compatible',
] as const;

export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

@Injectable()
export class AiProviderFactory {
  private readonly logger = new Logger(AiProviderFactory.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ollamaProvider: OllamaProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly geminiProvider: GeminiProvider,
    private readonly mistralProvider: MistralProvider,
    private readonly openAiCompatibleProvider: OpenAiCompatibleProvider,
  ) {}

  /**
   * Returns the primary provider configured via AI_PROVIDER env var.
   * Throws a descriptive error for unknown provider names.
   * Falls back to the fallback provider only when AI_ENABLE_PROVIDER_FALLBACK=true
   * AND the caller catches an error and calls this explicitly.
   */
  getProvider(): AiProvider {
    const providerName = (
      this.configService.get<string>('AI_PROVIDER') || 'ollama'
    ).toLowerCase();
    return this.resolveProvider(providerName);
  }

  /**
   * Returns a provider by name, optionally recording a model override for the caller.
   * Does NOT mutate the singleton provider instance — callers must pass modelOverride
   * into the extractDocumentMetadata input.
   */
  getProviderByName(providerName: string): AiProvider {
    return this.resolveProvider(providerName.toLowerCase());
  }

  /**
   * Returns the configured fallback provider (AI_FALLBACK_PROVIDER env).
   * Only intended for use when AI_ENABLE_PROVIDER_FALLBACK=true.
   */
  getFallbackProvider(): AiProvider | null {
    const enabled =
      this.configService.get<string>('AI_ENABLE_PROVIDER_FALLBACK') === 'true';
    if (!enabled) return null;

    const fallbackName = (
      this.configService.get<string>('AI_FALLBACK_PROVIDER') || 'ollama'
    ).toLowerCase();

    try {
      return this.resolveProvider(fallbackName);
    } catch {
      this.logger.error(
        `Fallback provider '${fallbackName}' is not configured correctly`,
      );
      return null;
    }
  }

  /** Check whether a provider name is supported */
  isValidProvider(name: string): boolean {
    return (SUPPORTED_PROVIDERS as readonly string[]).includes(
      name.toLowerCase(),
    );
  }

  /** Return all supported provider names */
  getSupportedProviders(): readonly ProviderName[] {
    return SUPPORTED_PROVIDERS;
  }

  private resolveProvider(name: string): AiProvider {
    switch (name) {
      case 'ollama':
        return this.ollamaProvider;
      case 'openai':
        return this.openAiProvider;
      case 'anthropic':
        return this.anthropicProvider;
      case 'gemini':
        return this.geminiProvider;
      case 'mistral':
        return this.mistralProvider;
      case 'openai-compatible':
        return this.openAiCompatibleProvider;
      default:
        throw new Error(
          `Unknown AI provider: "${name}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}. ` +
            `Set AI_PROVIDER in your .env to one of the supported values.`,
        );
    }
  }
}
