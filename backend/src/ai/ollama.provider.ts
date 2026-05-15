import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiProvider, DocumentMetadata, DocumentMetadataSchema } from './ai.provider';

@Injectable()
export class OllamaProvider implements AiProvider {
  name = 'ollama';
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434';
    this.model = this.configService.get<string>('OLLAMA_MODEL') || 'llama3.1:8b';
  }

  async extractDocumentMetadata(input: { text: string; originalFilename: string; }): Promise<DocumentMetadata> {
    const prompt = this.buildPrompt(input.text, input.originalFilename);
    
    let result = await this.callOllama(prompt);
    
    try {
      return this.parseAndValidate(result);
    } catch (e) {
      this.logger.warn('Initial validation failed, retrying with stricter prompt', e.message);
      const repairPrompt = `The following JSON was invalid or failed schema validation:
${result}

Error: ${e.message}

Please return ONLY valid JSON matching this schema exactly, with no markdown formatting:
{
  "title": "string",
  "category": "invoice" | "contract" | "receipt" | "bank_statement" | "tax_document" | "legal_document" | "medical_document" | "resume" | "report" | "other",
  "documentDate": "string or null",
  "issuer": "string or null",
  "recipient": "string or null",
  "referenceNumber": "string or null",
  "suggestedFilename": "string",
  "confidence": number between 0 and 1,
  "summary": "string"
}`;
      result = await this.callOllama(repairPrompt);
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
    
    const parsed = JSON.parse(jsonStr);
    return DocumentMetadataSchema.parse(parsed);
  }

  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: this.model,
        prompt,
        stream: false,
        format: 'json',
      }, {
        timeout: 600000, // 10 minutes timeout
      });

      return response.data.response;
    } catch (error) {
      this.logger.error('Failed to communicate with Ollama', error.message);
      throw error;
    }
  }

  private buildPrompt(text: string, originalFilename: string): string {
    return `Extract metadata from the following document text. The original filename is "${originalFilename}".
Return ONLY a valid JSON object matching this schema, with no additional text or markdown formatting:
{
  "title": "Document title",
  "category": "One of: invoice, contract, receipt, bank_statement, tax_document, legal_document, medical_document, resume, report, other",
  "documentDate": "ISO date string or null if not found",
  "issuer": "Entity that issued the document, or null if not found",
  "recipient": "Entity receiving the document, or null if not found",
  "referenceNumber": "Any ID, invoice number, etc., or null if not found",
  "suggestedFilename": "A safe filename ending in .pdf",
  "confidence": A number between 0 and 1 indicating your confidence in the extraction,
  "summary": "A brief 1-2 sentence summary of the document"
}

Document text:
${text.substring(0, 10000)} // Limiting text length for context window
`;
  }
}
