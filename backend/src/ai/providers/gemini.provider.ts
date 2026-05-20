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

/**
 * Gemini response schema adapted for the generateContent API.
 * Gemini uses a subset of OpenAPI 3.0 — no $schema, refs, or anyOf with null.
 * We represent nullable fields with a NULLABLE_STRING type helper.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'A clear, professional title.' },
    category: {
      type: 'STRING',
      enum: DOCUMENT_METADATA_JSON_SCHEMA.properties.category
        .enum as unknown as string[],
    },
    documentDate: {
      type: 'STRING',
      nullable: true,
      description: 'YYYY-MM-DD or null.',
    },
    issuer: { type: 'STRING', nullable: true },
    recipient: { type: 'STRING', nullable: true },
    referenceNumber: { type: 'STRING', nullable: true },
    suggestedFilename: {
      type: 'STRING',
      description: 'Filename ending in .pdf.',
    },
    confidence: { type: 'NUMBER', description: '0.0 to 1.0.' },
    summary: { type: 'STRING' },
    language: { type: 'STRING', description: "ISO 639-1 code, e.g. 'en'." },
  },
  required: [
    'title',
    'category',
    'documentDate',
    'issuer',
    'recipient',
    'referenceNumber',
    'suggestedFilename',
    'confidence',
    'summary',
    'language',
  ],
};

@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.defaultModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
    this.baseUrl =
      this.configService.get<string>('GEMINI_BASE_URL') ||
      'https://generativelanguage.googleapis.com';
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

    // Attempt 1: structured output with responseSchema
    try {
      const result = await this.callGemini(
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
        'Gemini structured attempt failed, retrying with repair prompt',
        (e as Error).message,
      );
    }

    // Attempt 2: repair
    try {
      const repairPrompt = buildRepairPrompt(
        '(initial response was invalid)',
        'Schema validation failed',
      );
      const result = await this.callGemini(
        activeModel,
        systemPrompt,
        repairPrompt,
        signal,
      );
      const metadata = parseAiJson(result.content);
      return { metadata, tokenUsage: result.tokenUsage };
    } catch (e: unknown) {
      if (this.isAbort(e)) throw e;
      throw new Error(`Gemini extraction failed: ${sanitizeAiError(e)}`);
    }
  }

  async healthCheck(): Promise<AiProviderHealth> {
    if (!this.apiKey) {
      return {
        provider: this.name,
        model: this.defaultModel,
        ok: false,
        errorMessage: 'GEMINI_API_KEY is not configured',
      };
    }
    const start = Date.now();
    try {
      const url = `${this.baseUrl}/v1beta/models/${this.defaultModel}:generateContent?key=${this.apiKey}`;
      await axios.post(
        url,
        {
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1 },
        },
        { timeout: 10000 },
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

  private async callGemini(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<{ content: string; tokenUsage?: TokenUsage }> {
    const url = `${this.baseUrl}/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await axios.post(
      url,
      {
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: this.temperature,
          maxOutputTokens: this.maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      },
      {
        timeout: this.timeoutMs,
        signal,
      },
    );

    const data = response.data as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const content =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ??
      '';

    const usage = data.usageMetadata;
    const tokenUsage: TokenUsage | undefined =
      usage?.promptTokenCount != null
        ? {
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
            totalTokens: usage.totalTokenCount ?? 0,
          }
        : undefined;

    return { content, tokenUsage };
  }

  private isAbort(e: unknown): boolean {
    return (
      (e instanceof Error && e.name === 'AbortError') ||
      (e instanceof Error && e.message === 'AbortError') ||
      axios.isCancel(e)
    );
  }
}
