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
import { OPENAI_JSON_SCHEMA_WRAPPER } from '../schemas/document-metadata-json-schema';

/**
 * OpenAI-compatible provider.
 *
 * Supports:
 * - Self-hosted vLLM
 * - LM Studio server
 * - OpenRouter-style APIs
 * - Any API exposing a /v1/chat/completions endpoint
 *
 * Strategy:
 * 1. Try json_schema response_format (if endpoint supports it)
 * 2. Fall back to json_object
 * 3. Fall back to plain prompt (no response_format)
 */
@Injectable()
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai-compatible';
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(private configService: ConfigService) {
    this.apiKey =
      this.configService.get<string>('OPENAI_COMPATIBLE_API_KEY') || '';
    this.defaultModel =
      this.configService.get<string>('OPENAI_COMPATIBLE_MODEL') || '';
    this.baseUrl =
      this.configService.get<string>('OPENAI_COMPATIBLE_BASE_URL') ||
      'http://localhost:8000/v1';
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

    const strategies: Array<'json_schema' | 'json_object' | 'none'> = [
      'json_schema',
      'json_object',
      'none',
    ];

    let lastContent = '';

    for (const strategy of strategies) {
      if (signal?.aborted) throw new Error('AbortError');

      try {
        const result = await this.callCompatible(
          activeModel,
          systemPrompt,
          userPrompt,
          strategy,
          signal,
        );
        lastContent = result.content;
        const metadata = parseAiJson(result.content);
        return { metadata, tokenUsage: result.tokenUsage };
      } catch (e: unknown) {
        if (this.isAbort(e)) throw e;
        this.logger.warn(
          `OpenAI-compatible strategy '${strategy}' failed: ${(e as Error).message}`,
        );
        if (strategy === 'none') {
          // All strategies failed — try one repair
          break;
        }
      }
    }

    // Final repair attempt
    try {
      const repairPrompt = buildRepairPrompt(
        lastContent || '(initial response was invalid)',
        'Schema validation failed after all strategies',
      );
      const result = await this.callCompatible(
        activeModel,
        systemPrompt,
        repairPrompt,
        'none',
        signal,
      );
      const metadata = parseAiJson(result.content);
      return { metadata, tokenUsage: result.tokenUsage };
    } catch (e: unknown) {
      if (this.isAbort(e)) throw e;
      throw new Error(
        `OpenAI-compatible extraction failed: ${sanitizeAiError(e)}`,
      );
    }
  }

  async healthCheck(): Promise<AiProviderHealth> {
    if (!this.baseUrl || !this.defaultModel) {
      return {
        provider: this.name,
        model: this.defaultModel || '(not configured)',
        ok: false,
        errorMessage:
          'OPENAI_COMPATIBLE_BASE_URL or OPENAI_COMPATIBLE_MODEL is not configured',
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

  private async callCompatible(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    responseFormat: 'json_schema' | 'json_object' | 'none',
    signal?: AbortSignal,
  ): Promise<{
    content: string;
    tokenUsage?: ReturnType<typeof extractTokenUsage>;
  }> {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.temperature,
      max_tokens: this.maxOutputTokens,
    };

    if (responseFormat === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: OPENAI_JSON_SCHEMA_WRAPPER,
      };
    } else if (responseFormat === 'json_object') {
      body.response_format = { type: 'json_object' };
    }
    // 'none' = no response_format key

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      body,
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private isAbort(e: unknown): boolean {
    return (
      (e instanceof Error && e.name === 'AbortError') ||
      (e instanceof Error && e.message === 'AbortError') ||
      axios.isCancel(e)
    );
  }
}
