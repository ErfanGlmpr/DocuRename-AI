import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from './ai.provider';
import { OllamaProvider } from './ollama.provider';

@Injectable()
export class AiProviderFactory {
  private readonly logger = new Logger(AiProviderFactory.name);

  constructor(private configService: ConfigService) {}

  getProvider(): AiProvider {
    const providerName =
      this.configService.get<string>('AI_PROVIDER') || 'ollama';

    if (providerName === 'ollama') {
      return new OllamaProvider(this.configService);
    }

    this.logger.warn(
      `Provider ${providerName} is not supported yet, falling back to ollama`,
    );
    return new OllamaProvider(this.configService);
  }
}
