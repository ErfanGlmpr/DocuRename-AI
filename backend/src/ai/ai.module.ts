import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { FilenameGeneratorService } from './filename-generator/filename-generator.service';
import { AiProviderFactory } from './ai.factory';
import { OllamaProvider } from './ollama.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { MistralProvider } from './providers/mistral.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';
import { AiProvidersController } from './ai-providers.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, AuditModule, AuthModule],
  controllers: [AiProvidersController],
  providers: [
    FilenameGeneratorService,
    AiProviderFactory,
    OllamaProvider,
    OpenAiProvider,
    AnthropicProvider,
    GeminiProvider,
    MistralProvider,
    OpenAiCompatibleProvider,
  ],
  exports: [FilenameGeneratorService, AiProviderFactory],
})
export class AiModule {}
