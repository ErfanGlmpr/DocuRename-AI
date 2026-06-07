import {
  Controller,
  Get,
  Post,
  Param,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AiProviderFactory } from './ai.factory';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface ProviderInfo {
  name: string;
  configured: boolean;
  model: string;
  missing?: string[];
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiProvidersController {
  private readonly logger = new Logger(AiProvidersController.name);

  constructor(
    private readonly aiFactory: AiProviderFactory,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary: 'List all supported AI providers and their configuration status',
    description:
      'Returns configured providers and models. Never reveals API keys.',
  })
  getProviders(): { providers: ProviderInfo[] } {
    const providers: ProviderInfo[] = [
      this.describeOllama(),
      this.describeOpenAi(),
      this.describeAnthropic(),
      this.describeGemini(),
      this.describeMistral(),
      this.describeOpenAiCompatible(),
    ];

    return { providers };
  }

  @Post('providers/:provider/health')
  @ApiOperation({
    summary: 'Check connectivity for a specific AI provider',
    description:
      'Sends a minimal harmless request. Never sends document content.',
  })
  @ApiParam({
    name: 'provider',
    description:
      'Provider name: ollama | openai | anthropic | gemini | mistral | openai-compatible',
  })
  async checkHealth(@Param('provider') providerName: string) {
    if (!this.aiFactory.isValidProvider(providerName)) {
      return {
        provider: providerName,
        ok: false,
        errorMessage: `Unknown provider: ${providerName}`,
      };
    }

    const provider = this.aiFactory.getProviderByName(providerName);

    if (!provider.healthCheck) {
      return {
        provider: provider.name,
        model: provider.model,
        ok: false,
        errorMessage: 'Health check not implemented for this provider',
      };
    }

    const result = await provider.healthCheck();

    await this.auditService.log({
      action: 'AI_PROVIDER_HEALTH_CHECKED',
      metadata: {
        provider: result.provider,
        model: result.model,
        ok: result.ok,
        latencyMs: result.latencyMs,
        errorMessage: result.errorMessage,
      },
    });

    this.logger.log(
      `Health check for ${providerName}: ok=${result.ok} latency=${result.latencyMs}ms`,
    );

    return result;
  }

  // -------------------------------------------------------------------------
  // Provider description helpers
  // -------------------------------------------------------------------------

  private describeOllama(): ProviderInfo {
    const baseUrl = this.configService.get<string>('OLLAMA_BASE_URL');
    const model = this.configService.get<string>('OLLAMA_MODEL') || 'gemma3:4b';
    const missing: string[] = [];
    if (!baseUrl) missing.push('OLLAMA_BASE_URL');
    return {
      name: 'ollama',
      configured: missing.length === 0,
      model,
      ...(missing.length > 0 && { missing }),
    };
  }

  private describeOpenAi(): ProviderInfo {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    const missing: string[] = [];
    if (!apiKey) missing.push('OPENAI_API_KEY');
    return {
      name: 'openai',
      configured: missing.length === 0,
      model,
      ...(missing.length > 0 && { missing }),
    };
  }

  private describeAnthropic(): ProviderInfo {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    const model =
      this.configService.get<string>('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
    const missing: string[] = [];
    if (!apiKey) missing.push('ANTHROPIC_API_KEY');
    return {
      name: 'anthropic',
      configured: missing.length === 0,
      model,
      ...(missing.length > 0 && { missing }),
    };
  }

  private describeGemini(): ProviderInfo {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const model =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
    const missing: string[] = [];
    if (!apiKey) missing.push('GEMINI_API_KEY');
    return {
      name: 'gemini',
      configured: missing.length === 0,
      model,
      ...(missing.length > 0 && { missing }),
    };
  }

  private describeMistral(): ProviderInfo {
    const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
    const model =
      this.configService.get<string>('MISTRAL_MODEL') || 'mistral-small-latest';
    const missing: string[] = [];
    if (!apiKey) missing.push('MISTRAL_API_KEY');
    return {
      name: 'mistral',
      configured: missing.length === 0,
      model,
      ...(missing.length > 0 && { missing }),
    };
  }

  private describeOpenAiCompatible(): ProviderInfo {
    const baseUrl = this.configService.get<string>(
      'OPENAI_COMPATIBLE_BASE_URL',
    );
    const model = this.configService.get<string>('OPENAI_COMPATIBLE_MODEL');
    const missing: string[] = [];
    if (!baseUrl) missing.push('OPENAI_COMPATIBLE_BASE_URL');
    if (!model) missing.push('OPENAI_COMPATIBLE_MODEL');
    return {
      name: 'openai-compatible',
      configured: missing.length === 0,
      model: model || '(not set)',
      ...(missing.length > 0 && { missing }),
    };
  }
}
