import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all documents' })
  async findAll() {
    return this.documentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document details' })
  @ApiParam({ name: 'id', description: 'The unique identifier of the document' })
  async findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get a presigned download URL for the document' })
  @ApiParam({ name: 'id', description: 'The unique identifier of the document' })
  async getDownloadUrl(@Param('id') id: string) {
    return this.documentsService.getDownloadUrl(id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry processing for a failed document' })
  @ApiParam({ name: 'id', description: 'The unique identifier of the document' })
  async retryProcessing(@Param('id') id: string) {
    return this.documentsService.retryProcessing(id);
  }

  @Patch(':id/filename')
  @ApiOperation({ summary: 'Update the final filename and perform rename operation' })
  @ApiParam({ name: 'id', description: 'The unique identifier of the document' })
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
  ) {
    return this.documentsService.updateFilename(id, filename);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document and its files' })
  @ApiParam({ name: 'id', description: 'The unique identifier of the document' })
  async remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel document processing' })
  @ApiParam({ name: 'id', description: 'The unique identifier of the document' })
  async cancel(@Param('id') id: string) {
    return this.documentsService.cancel(id);
  }
}
