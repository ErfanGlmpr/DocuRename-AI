import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  AiProvider,
  AiProviderHealth,
  ExtractionResult,
  TokenUsage,
} from '../ai.provider';
import {
  buildDocumentMetadataSystemPrompt,
  buildDocumentMetadataUserPrompt,
  buildRepairPrompt,
} from '../prompts/document-metadata.prompt';
import { parseAiJson, sanitizeAiError } from '../utils/parse-ai-json';
import { DOCUMENT_METADATA_JSON_SCHEMA } from '../schemas/document-metadata-json-schema';

/** Anthropic tool definition for forced structured extraction */
const EXTRACTION_TOOL = {
  name: 'extract_document_metadata',
  description: 'Extract structured metadata from a document.',
  input_schema: {
    ...DOCUMENT_METADATA_JSON_SCHEMA,
    // Anthropic requires type as plain "object" string — already is.
  },
} as const;

@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY') || '';
    this.defaultModel =
      this.configService.get<string>('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
    this.baseUrl =
      this.configService.get<string>('ANTHROPIC_BASE_URL') ||
      'https://api.anthropic.com';
    this.version =
      this.configService.get<string>('ANTHROPIC_VERSION') || '2023-06-01';
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

    // Attempt 1: forced tool use (structured output)
    try {
      const result = await this.callAnthropic(
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
        'Anthropic tool-use attempt failed, retrying with repair prompt',
        (e as Error).message,
      );
    }

    // Attempt 2: repair
    try {
      const repairPrompt = buildRepairPrompt(
        '(initial response was invalid)',
        'Schema validation failed',
      );
      const result = await this.callAnthropic(
        activeModel,
        systemPrompt,
        repairPrompt,
        signal,
      );
      const metadata = parseAiJson(result.content);
      return { metadata, tokenUsage: result.tokenUsage };
    } catch (e: unknown) {
      if (this.isAbort(e)) throw e;
      throw new Error(`Anthropic extraction failed: ${sanitizeAiError(e)}`);
    }
  }

  async healthCheck(): Promise<AiProviderHealth> {
    if (!this.apiKey) {
      return {
        provider: this.name,
        model: this.defaultModel,
        ok: false,
        errorMessage: 'ANTHROPIC_API_KEY is not configured',
      };
    }
    const start = Date.now();
    try {
      await axios.post(
        `${this.baseUrl}/v1/messages`,
        {
          model: this.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
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

  private async callAnthropic(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<{ content: string; tokenUsage?: TokenUsage }> {
    const response = await axios.post(
      `${this.baseUrl}/v1/messages`,
      {
        model,
        max_tokens: this.maxOutputTokens,
        temperature: this.temperature,
        system: systemPrompt,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: 'extract_document_metadata' },
        messages: [{ role: 'user', content: userPrompt }],
      },
      {
        headers: this.buildHeaders(),
        timeout: this.timeoutMs,
        signal,
      },
    );

    const data = response.data as {
      content?: { type: string; input?: unknown; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    // Extract tool_use block first; fall back to text block
    let content = '';
    for (const block of data.content ?? []) {
      if (block.type === 'tool_use' && block.input != null) {
        content = JSON.stringify(block.input);
        break;
      }
      if (block.type === 'text' && block.text) {
        content = block.text;
      }
    }

    const usage = data.usage;
    const tokenUsage: TokenUsage | undefined =
      usage?.input_tokens != null || usage?.output_tokens != null
        ? {
            promptTokens: usage?.input_tokens ?? 0,
            completionTokens: usage?.output_tokens ?? 0,
            totalTokens:
              (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
          }
        : undefined;

    return { content, tokenUsage };
  }

  private buildHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': this.version,
      'content-type': 'application/json',
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
