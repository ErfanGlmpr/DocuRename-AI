import { Controller, Post, UseInterceptors, UploadedFiles, ParseFilePipeBuilder, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('documents')
@Controller('documents/upload')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files'))
  @ApiOperation({ summary: 'Upload one or more PDF documents' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  async uploadFiles(
    @UploadedFiles()
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file must be uploaded');
    }

    const maxSizeMB = parseInt(this.configService.get('MAX_UPLOAD_SIZE_MB') || '25', 10);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    const validFiles = files.filter(f => f.size <= maxSizeBytes);
    if (validFiles.length === 0) {
      throw new BadRequestException(`All files exceed maximum size of ${maxSizeMB}MB`);
    }

    return this.uploadsService.processUploads(validFiles);
  }
}
