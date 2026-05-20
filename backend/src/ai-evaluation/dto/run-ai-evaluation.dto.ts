import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RunAiEvaluationDto {
  @ApiProperty({
    description: 'Provider name',
    example: 'openai',
    enum: [
      'ollama',
      'openai',
      'anthropic',
      'gemini',
      'mistral',
      'openai-compatible',
    ],
  })
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty({
    description:
      'Model name override (optional — uses provider default if omitted)',
    example: 'gpt-4o-mini',
    required: false,
  })
  @IsString()
  model?: string;
}
