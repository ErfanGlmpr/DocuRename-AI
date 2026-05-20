import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { RunAiEvaluationDto } from './run-ai-evaluation.dto';

export class RunBatchAiEvaluationDto {
  @ApiProperty({
    description:
      'Array of provider/model combinations to evaluate sequentially',
    type: [RunAiEvaluationDto],
    example: [
      { provider: 'ollama', model: 'gemma3:4b' },
      { provider: 'openai', model: 'gpt-4o-mini' },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RunAiEvaluationDto)
  runs: RunAiEvaluationDto[];
}
