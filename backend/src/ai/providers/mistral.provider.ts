import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiProvider, AiProviderHealth, ExtractionResult } from '../ai.provider';
import {
  buildDocumentMetadataSystemPrompt,
  buildDocumentMetadataUserPrompt,
  buildRepairPrompt,
} from '../prompts/document-metadata.prompt';
import {
  parseAiJson,
  sanitizeAiError,
  extractTokenUsage,
} from '../utils/parse-ai-json';

@Injectable()
export class MistralProvider implements AiProvider {
  readonly name = 'mistral';
  private readonly logger = new Logger(MistralProvider.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MISTRAL_API_KEY') || '';
    this.defaultModel =
      this.configService.get<string>('MISTRAL_MODEL') || 'mistral-small-latest';
    this.baseUrl =
      this.configService.get<string>('MISTRAL_BASE_URL') ||
      'https://api.mistral.ai/v1';
    this.timeoutMs = parseInt(
      this.configService.get<string>('AI_REQUEST_TIMEOUT_MS') || '180000',
      10,
    );
    this.temperature = parseFloat(
      this.configService.get<string>('AI_TEMPERATURE') || '0',
    );
    this.maxOutputTokens = parseInt(
      this.configService.get<string>('AI_MAX_OUTPUT_TOKENS') || '2048',
      10,
    );
  }

  get model(): string {
    return this.defaultModel;
  }

  async extractDocumentMetadata(
    input: { text: string; originalFilename: string; modelOverride?: string },
    signal?: AbortSignal,
  ): Promise<ExtractionResult> {
    const activeModel = input.modelOverride ?? this.defaultModel;
    const systemPrompt = buildDocumentMetadataSystemPrompt();
    const userPrompt = buildDocumentMetadataUserPrompt({
      text: input.text,
      originalFilename: input.originalFilename,
    });

    // Attempt 1: json_object response format
    try {
      const result = await this.callMistral(
        activeModel,
        systemPrompt,
        userPrompt,
        signal,
      );
      const metadata = parseAiJson(result.content);
      return { metadata, tokenUsage: result.tokenUsage };
    } catch (e: unknown) {
      if (this.isAbort(e)) throw e;
      this.logger.warn(
        'Mistral initial attempt failed, retrying with repair prompt',
        (e as Error).message,
      );
    }

    // Attempt 2: repair
    try {
      const repairPrompt = buildRepairPrompt(
        '(initial response was invalid)',
        'Schema validation failed',
      );
      const result = await this.callMistral(
        activeModel,
        systemPrompt,
        repairPrompt,
        signal,
      );
      const metadata = parseAiJson(result.content);
      return { metadata, tokenUsage: result.tokenUsage };
    } catch (e: unknown) {
      if (this.isAbort(e)) throw e;
      throw new Error(`Mistral extraction failed: ${sanitizeAiError(e)}`);
    }
  }

  async healthCheck(): Promise<AiProviderHealth> {
    if (!this.apiKey) {
      return {
        provider: this.name,
        model: this.defaultModel,
        ok: false,
        errorMessage: 'MISTRAL_API_KEY is not configured',
      };
    }
    const start = Date.now();
    try {
      await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.defaultModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        },
        {
          headers: this.buildHeaders(),
          timeout: 10000,
        },
      );
      return {
        provider: this.name,
        model: this.defaultModel,
        ok: true,
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      return {
        provider: this.name,
        model: this.defaultModel,
        ok: false,
        latencyMs: Date.now() - start,
        errorMessage: sanitizeAiError(error),
      };
    }
  }

  private async callMistral(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<{
    content: string;
    tokenUsage?: ReturnType<typeof extractTokenUsage>;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.temperature,
        max_tokens: this.maxOutputTokens,
        response_format: { type: 'json_object' },
      },
      {
        headers: this.buildHeaders(),
        timeout: this.timeoutMs,
        signal,
      },
    );

    const data = response.data as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const content = data.choices?.[0]?.message?.content ?? '';
    const tokenUsage = extractTokenUsage(data.usage, {
      promptTokens: 'prompt_tokens',
      completionTokens: 'completion_tokens',
      totalTokens: 'total_tokens',
    });

    return { content, tokenUsage };
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private isAbort(e: unknown): boolean {
    return (
      (e instanceof Error && e.name === 'AbortError') ||
      (e instanceof Error && e.message === 'AbortError') ||
      axios.isCancel(e)
    );
  }
}
