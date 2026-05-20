import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiProvider, AiProviderHealth, ExtractionResult } from './ai.provider';
import {
  buildDocumentMetadataSystemPrompt,
  buildDocumentMetadataUserPrompt,
  buildRepairPrompt,
} from './prompts/document-metadata.prompt';
import { parseAiJson, sanitizeAiError } from './utils/parse-ai-json';

@Injectable()
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor(private configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://127.0.0.1:11434';
    this.defaultModel =
      this.configService.get<string>('OLLAMA_MODEL') || 'gemma3:4b';
    this.timeoutMs = parseInt(
      this.configService.get<string>('AI_REQUEST_TIMEOUT_MS') || '180000',
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
    const system = buildDocumentMetadataSystemPrompt();
    const prompt = buildDocumentMetadataUserPrompt({
      text: input.text,
      originalFilename: input.originalFilename,
    });

    let accumulatedPromptTokens = 0;
    let accumulatedCompletionTokens = 0;

    let callResult = await this.callOllama(activeModel, prompt, system, signal);
    accumulatedPromptTokens += callResult.promptTokens;
    accumulatedCompletionTokens += callResult.completionTokens;

    try {
      const metadata = parseAiJson(callResult.response);
      return {
        metadata,
        tokenUsage: {
          promptTokens: accumulatedPromptTokens,
          completionTokens: accumulatedCompletionTokens,
          totalTokens: accumulatedPromptTokens + accumulatedCompletionTokens,
        },
      };
    } catch (e: unknown) {
      if (
        (e as Error).name === 'AbortError' ||
        axios.isCancel(e) ||
        (e as Error).message === 'AbortError'
      ) {
        throw e;
      }

      this.logger.warn(
        'Initial validation failed, retrying with repair prompt',
        (e as Error).message,
      );

      const repairSystem =
        'You are a JSON repair assistant. Return ONLY valid JSON matching the requested schema. No talk. Do NOT wrap your output in markdown code blocks like ```json or similar. Start your response directly with { and end with }.';
      const repairPrompt = buildRepairPrompt(
        callResult.response,
        (e as Error).message,
      );

      callResult = await this.callOllama(
        activeModel,
        repairPrompt,
        repairSystem,
        signal,
      );
      accumulatedPromptTokens += callResult.promptTokens;
      accumulatedCompletionTokens += callResult.completionTokens;

      const metadata = parseAiJson(callResult.response);
      return {
        metadata,
        tokenUsage: {
          promptTokens: accumulatedPromptTokens,
          completionTokens: accumulatedCompletionTokens,
          totalTokens: accumulatedPromptTokens + accumulatedCompletionTokens,
        },
      };
    }
  }

  async healthCheck(): Promise<AiProviderHealth> {
    const start = Date.now();
    try {
      await axios.post(
        `${this.baseUrl}/api/generate`,
        {
          model: this.defaultModel,
          prompt: 'ping',
          stream: false,
          options: { num_predict: 1 },
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

  private async callOllama(
    model: string,
    prompt: string,
    system?: string,
    signal?: AbortSignal,
  ): Promise<{
    response: string;
    promptTokens: number;
    completionTokens: number;
  }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        {
          model,
          prompt,
          system,
          stream: false,
          format: 'json',
          options: {
            num_ctx: 8192,
            temperature: parseFloat(
              this.configService.get<string>('AI_TEMPERATURE') || '0',
            ),
          },
        },
        {
          timeout: this.timeoutMs,
          signal,
        },
      );

      const responseData = response.data as {
        response: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      return {
        response: responseData.response,
        promptTokens: responseData.prompt_eval_count || 0,
        completionTokens: responseData.eval_count || 0,
      };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to communicate with Ollama',
        (error as Error).message,
      );
      throw error;
    }
  }
}
