import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { AiEvaluationService } from './ai-evaluation.service';
import { RunAiEvaluationDto } from './dto/run-ai-evaluation.dto';
import { RunBatchAiEvaluationDto } from './dto/run-batch-ai-evaluation.dto';

@ApiTags('ai-evaluations')
@Controller('documents')
export class AiEvaluationController {
  constructor(private readonly evaluationService: AiEvaluationService) {}

  @Post(':id/ai-evaluations')
  @ApiOperation({
    summary: 'Run a single AI provider evaluation against an existing document',
    description:
      'Uses redacted/minimized text — never raw extracted text. Does NOT overwrite document metadata.',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiBody({ type: RunAiEvaluationDto })
  async runEvaluation(
    @Param('id') id: string,
    @Body() dto: RunAiEvaluationDto,
  ) {
    return this.evaluationService.runEvaluation(id, dto.provider, dto.model);
  }

  @Get(':id/ai-evaluations')
  @ApiOperation({
    summary: 'List all AI evaluation runs for a document',
    description: 'Returns all runs ordered by createdAt descending.',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async listEvaluations(@Param('id') id: string) {
    return this.evaluationService.listEvaluations(id);
  }

  @Post(':id/ai-evaluations/batch')
  @ApiOperation({
    summary: 'Run multiple provider/model evaluations sequentially',
    description:
      'Runs all combinations sequentially. Continues on failure. Returns a summary with completed/failed counts.',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiBody({ type: RunBatchAiEvaluationDto })
  async runBatch(
    @Param('id') id: string,
    @Body() dto: RunBatchAiEvaluationDto,
  ) {
    return this.evaluationService.runBatch(id, dto.runs);
  }
}
