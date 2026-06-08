import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

@Injectable()
export class PdfUploadValidationPipe implements PipeTransform<
  Express.Multer.File[],
  Express.Multer.File[]
> {
  constructor(private readonly configService: ConfigService) {}

  transform(files: Express.Multer.File[]): Express.Multer.File[] {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file must be uploaded');
    }

    const maxFiles = parseInt(
      this.configService.get('MAX_FILES_PER_UPLOAD') || '10',
      10,
    );
    const maxTotalSizeMB = parseInt(
      this.configService.get('MAX_TOTAL_UPLOAD_SIZE_MB') || '100',
      10,
    );
    const maxSizeMB = parseInt(
      this.configService.get('MAX_UPLOAD_SIZE_MB') || '25',
      10,
    );

    if (files.length > maxFiles) {
      throw new BadRequestException(
        `Exceeded maximum of ${maxFiles} files per upload`,
      );
    }

    const maxTotalSizeBytes = maxTotalSizeMB * 1024 * 1024;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    let totalSize = 0;
    const messages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileErrors: string[] = [];

      if (file.size === 0) {
        fileErrors.push('File is empty');
      }

      if (file.size > maxSizeBytes) {
        fileErrors.push(`File exceeds maximum size of ${maxSizeMB}MB`);
      }

      if (file.mimetype !== 'application/pdf') {
        fileErrors.push('Invalid MIME type. Expected application/pdf');
      }

      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.pdf') {
        fileErrors.push('Invalid extension. Expected .pdf');
      }

      if (file.buffer && file.buffer.length >= 5) {
        const magicBytes = file.buffer.toString('utf8', 0, 5);
        if (magicBytes !== '%PDF-') {
          fileErrors.push('Invalid file signature. Not a valid PDF document');
        }
      } else {
        fileErrors.push('File is too small to be a valid PDF');
      }

      if (fileErrors.length > 0) {
        const name = file.originalname || `file_${i}`;
        fileErrors.forEach((err) => messages.push(`${name}: ${err}`));
      }

      totalSize += file.size;
    }

    if (totalSize > maxTotalSizeBytes) {
      messages.push(`Total upload size exceeds ${maxTotalSizeMB}MB limit`);
    }

    if (messages.length > 0) {
      throw new BadRequestException({
        message: messages,
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    return files;
  }
}
