import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiEvaluationService } from './ai-evaluation.service';
import { RunAiEvaluationDto } from './dto/run-ai-evaluation.dto';
import { RunBatchAiEvaluationDto } from './dto/run-batch-ai-evaluation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@ApiTags('ai-evaluations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class AiEvaluationController {
  constructor(private readonly evaluationService: AiEvaluationService) {}

  @Post(':id/ai-evaluations')
  @Throttle({
    default: {
      limit: parseInt(
        process.env.AI_EVALUATION_RATE_LIMIT_MAX_REQUESTS || '20',
        10,
      ),
      ttl: parseInt(process.env.RATE_LIMIT_TTL_SECONDS || '60', 10) * 1000,
    },
  })
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.evaluationService.runEvaluation(
      id,
      dto.provider,
      user.organizationId,
      dto.model,
      user.id,
    );
  }

  @Get(':id/ai-evaluations')
  @ApiOperation({
    summary: 'List all AI evaluation runs for a document',
    description: 'Returns all runs ordered by createdAt descending.',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async listEvaluations(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.evaluationService.listEvaluations(id, user.organizationId);
  }

  @Post(':id/ai-evaluations/batch')
  @Throttle({
    default: {
      limit: parseInt(
        process.env.AI_EVALUATION_RATE_LIMIT_MAX_REQUESTS || '20',
        10,
      ),
      ttl: parseInt(process.env.RATE_LIMIT_TTL_SECONDS || '60', 10) * 1000,
    },
  })
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.evaluationService.runBatch(
      id,
      dto.runs,
      user.organizationId,
      user.id,
    );
  }
}
