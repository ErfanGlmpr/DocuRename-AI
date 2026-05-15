import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FilenameGeneratorService } from './filename-generator/filename-generator.service';
import { AiProviderFactory } from './ai.factory';
import { OllamaProvider } from './ollama.provider';

@Module({
  imports: [ConfigModule],
  providers: [FilenameGeneratorService, AiProviderFactory, OllamaProvider],
  exports: [FilenameGeneratorService, AiProviderFactory],
})
export class AiModule {}
