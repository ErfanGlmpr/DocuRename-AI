import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  AiProvider,
  DocumentMetadata,
  DocumentMetadataSchema,
} from './ai.provider';

@Injectable()
export class OllamaProvider implements AiProvider {
  name = 'ollama';
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://127.0.0.1:11434';
    this.model =
      this.configService.get<string>('OLLAMA_MODEL') || 'llama3.1:8b';
  }

  async extractDocumentMetadata(
    input: { text: string; originalFilename: string },
    signal?: AbortSignal,
  ): Promise<DocumentMetadata> {
    const { system, prompt } = this.buildPrompt(
      input.text,
      input.originalFilename,
    );

    let result = await this.callOllama(prompt, system, signal);

    try {
      return this.parseAndValidate(result);
    } catch (e: any) {
      if ((e as Error).name === 'AbortError' || axios.isCancel(e)) {
        throw e;
      }
      this.logger.warn(
        'Initial validation failed, retrying with repair prompt',
        (e as Error).message,
      );
      const repairSystem =
        'You are a JSON repair assistant. Return ONLY valid JSON matching the requested schema. No talk.';
      const repairPrompt = `The following JSON was invalid or failed schema validation:
${result}

Error: ${(e as Error).message}

Please return ONLY valid JSON matching the schema exactly.`;
      result = await this.callOllama(repairPrompt, repairSystem, signal);
      return this.parseAndValidate(result);
    }
  }

  private parseAndValidate(result: string): DocumentMetadata {
    // Attempt to extract JSON if markdown wrapped
    let jsonStr = result;
    const jsonMatch = result.match(/```(?:json)?(.*?)```/s);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr) as unknown;
    return DocumentMetadataSchema.parse(parsed);
  }

  private async callOllama(
    prompt: string,
    system?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        {
          model: this.model,
          prompt,
          system,
          stream: false,
          format: 'json',
          options: {
            num_ctx: 8192, // Expanded context window
            temperature: 0, // Deterministic output
          },
        },
        {
          timeout: 1800000, // 30 minutes timeout
          signal, // Pass the AbortSignal to axios
        },
      );

      return (response.data as { response: string }).response;
    } catch (error: any) {
      this.logger.error(
        'Failed to communicate with Ollama',
        (error as Error).message,
      );
      throw error;
    }
  }

  private buildPrompt(
    text: string,
    originalFilename: string,
  ): { system: string; prompt: string } {
    const system = `### TASK
Extract structured metadata from the document text provided by the user. 
The document may contain privacy placeholders like [PERSON_1], [ADDRESS_1], [VAT_ID_1], etc. Treat these as actual names or identifiers.

### OUTPUT FORMAT
Return ONLY a valid JSON object matching the schema below. No preamble, no markdown, no explanation.

### SCHEMA
{
  "title": "A clear, professional title for the document",
  "category": "invoice" | "contract" | "receipt" | "bank_statement" | "tax_document" | "legal_document" | "medical_document" | "resume" | "report" | "other",
  "documentDate": "ISO 8601 date string (YYYY-MM-DD) or null",
  "issuer": "Entity that issued the document (e.g., GASAG) or null",
  "recipient": "Entity receiving the document or null",
  "referenceNumber": "Invoice number, customer ID, or reference ID or null",
  "suggestedFilename": "A concise, safe filename ending in .pdf (e.g., 2026-01-16_GASAG_Stromrechnung.pdf)",
  "confidence": A number between 0.0 and 1.0 (ignore redaction when scoring),
  "summary": "A concise 1-sentence summary"
}`;

    const prompt = `### CONTEXT
Original Filename: "${originalFilename}"

### DOCUMENT TEXT
${text}
`;

    return { system, prompt };
  }
}
