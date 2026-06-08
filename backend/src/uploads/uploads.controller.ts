import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { UploadsService } from './uploads.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents/upload')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @Throttle({
    default: {
      limit: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_REQUESTS || '20', 10),
      ttl: parseInt(process.env.RATE_LIMIT_TTL_SECONDS || '60', 10) * 1000,
    },
  })
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
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFiles()
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file must be uploaded');
    }

    const maxSizeMB = parseInt(
      this.configService.get('MAX_UPLOAD_SIZE_MB') || '25',
      10,
    );
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    const validFiles = files.filter((f) => f.size <= maxSizeBytes);
    if (validFiles.length === 0) {
      throw new BadRequestException(
        `All files exceed maximum size of ${maxSizeMB}MB`,
      );
    }

    return this.uploadsService.processUploads(validFiles, currentUser);
  }
}
