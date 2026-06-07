import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all documents for your organization' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.findAll(user.organizationId);
  }

  @Get('stuck')
  @ApiOperation({
    summary:
      'List all stuck documents that are blocked or missing from the queue',
  })
  async findStuck() {
    return this.documentsService.findStuck();
  }

  @Post('stuck/reconcile')
  @ApiOperation({
    summary:
      'Automatically reconcile stuck documents by marking them as FAILED',
  })
  async reconcileStuck() {
    return this.documentsService.reconcileStuck();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document details' })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the document',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.documentsService.findOnePublic(id, user.organizationId);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get a presigned download URL for the document' })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the document',
  })
  async getDownloadUrl(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getDownloadUrl(id, user.organizationId);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry processing for a failed document' })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the document',
  })
  async retryProcessing(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.retryProcessing(id, user.organizationId);
  }

  @Patch(':id/filename')
  @ApiOperation({
    summary: 'Update the final filename and perform rename operation',
  })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the document',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', example: 'new_document_name.pdf' },
      },
    },
  })
  async updateFilename(
    @Param('id') id: string,
    @Body('filename') filename: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.updateFilename(
      id,
      filename,
      user.organizationId,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document and its files' })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the document',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.remove(id, user.organizationId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel document processing' })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the document',
  })
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.cancel(id, user.organizationId);
  }
}
