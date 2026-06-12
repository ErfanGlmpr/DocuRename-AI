/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PdfUploadValidationPipe } from './pdf-upload-validation.pipe';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('PdfUploadValidationPipe', () => {
  let pipe: PdfUploadValidationPipe;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'MAX_FILES_PER_UPLOAD') return '2';
        if (key === 'MAX_TOTAL_UPLOAD_SIZE_MB') return '10';
        if (key === 'MAX_UPLOAD_SIZE_MB') return '5';
        return undefined;
      }),
    } as unknown as ConfigService;
    pipe = new PdfUploadValidationPipe(configService);
  });

  const createValidFile = (
    overrides?: Partial<Express.Multer.File>,
  ): Express.Multer.File => {
    return {
      fieldname: 'file',
      originalname: 'test.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('%PDF-1.4...'),
      stream: null as unknown as NodeJS.ReadableStream,
      destination: '',
      filename: '',
      path: '',
      ...overrides,
    };
  };

  it('1. rejects empty file list', () => {
    expect(() => pipe.transform([])).toThrow(BadRequestException);
    try {
      pipe.transform([]);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual({
        message: 'Upload validation failed',
        errors: [{ reason: 'At least one file must be uploaded' }],
        error: 'Bad Request',
        statusCode: 400,
      });
    }
  });

  it('2. rejects too many files', () => {
    const files = [createValidFile(), createValidFile(), createValidFile()];
    expect(() => pipe.transform(files)).toThrow(BadRequestException);
    try {
      pipe.transform(files);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual({
        message: 'Upload validation failed',
        errors: [{ reason: 'Exceeded maximum of 2 files per upload' }],
        error: 'Bad Request',
        statusCode: 400,
      });
    }
  });

  it('3. rejects invalid MIME type', () => {
    const files = [
      createValidFile({ mimetype: 'text/plain', originalname: 'test.txt' }),
    ];
    expect(() => pipe.transform(files)).toThrow(BadRequestException);
    try {
      pipe.transform(files);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual(
        expect.objectContaining({
          message: 'Upload validation failed',
          errors: expect.arrayContaining([
            expect.objectContaining({
              reason: 'Invalid MIME type. Expected application/pdf',
            }),
          ]),
        }),
      );
    }
  });

  it('4. rejects invalid file extension', () => {
    const files = [createValidFile({ originalname: 'test.txt' })];
    expect(() => pipe.transform(files)).toThrow(BadRequestException);
    try {
      pipe.transform(files);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              reason: 'Invalid extension. Expected .pdf',
            }),
          ]),
        }),
      );
    }
  });

  it('5. rejects bad PDF magic bytes', () => {
    const files = [createValidFile({ buffer: Buffer.from('NOTAPDF') })];
    expect(() => pipe.transform(files)).toThrow(BadRequestException);
    try {
      pipe.transform(files);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              reason: 'Invalid file signature. Not a valid PDF document',
            }),
          ]),
        }),
      );
    }
  });

  it('6. rejects empty file', () => {
    const files = [createValidFile({ size: 0 })];
    expect(() => pipe.transform(files)).toThrow(BadRequestException);
    try {
      pipe.transform(files);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ reason: 'File is empty' }),
          ]),
        }),
      );
    }
  });

  it('7. rejects oversized file', () => {
    // MAX_UPLOAD_SIZE_MB is 5
    const files = [createValidFile({ size: 6 * 1024 * 1024 })];
    expect(() => pipe.transform(files)).toThrow(BadRequestException);
    try {
      pipe.transform(files);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              reason: 'File exceeds maximum size of 5MB',
            }),
          ]),
        }),
      );
    }
  });

  it('8. rejects oversized total upload size', () => {
    // MAX_TOTAL_UPLOAD_SIZE_MB is 10
    const files = [
      createValidFile({ size: 6 * 1024 * 1024, originalname: '1.pdf' }),
      createValidFile({ size: 5 * 1024 * 1024, originalname: '2.pdf' }),
    ];
    expect(() => pipe.transform(files)).toThrow(BadRequestException);
    try {
      pipe.transform(files);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              reason: 'Total upload size exceeds 10MB limit',
            }),
          ]),
        }),
      );
    }
  });

  it('9. rejects mixed valid/invalid upload as a whole request', () => {
    const files = [
      createValidFile({ originalname: 'valid.pdf' }),
      createValidFile({
        originalname: 'invalid.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from('txt'),
      }),
    ];
    expect(() => pipe.transform(files)).toThrow(BadRequestException);
    try {
      pipe.transform(files);
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              filename: 'invalid.txt',
            }),
          ]),
        }),
      );
    }
  });

  it('10. returns structured error response', () => {
    const files = [
      createValidFile({
        originalname: 'invalid.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from('txt'),
      }),
    ];
    try {
      pipe.transform(files);
      fail('Should have thrown BadRequestException');
    } catch (error) {
      const e = error as BadRequestException;
      expect(e.getResponse()).toEqual({
        message: 'Upload validation failed',
        errors: [
          {
            filename: 'invalid.txt',
            reason: 'Invalid MIME type. Expected application/pdf',
          },
          {
            filename: 'invalid.txt',
            reason: 'Invalid extension. Expected .pdf',
          },
          {
            filename: 'invalid.txt',
            reason: 'File is too small to be a valid PDF',
          },
        ],
        error: 'Bad Request',
        statusCode: 400,
      });
    }
  });

  it('accepts valid files', () => {
    const files = [createValidFile()];
    expect(pipe.transform(files)).toEqual(files);
  });
});
