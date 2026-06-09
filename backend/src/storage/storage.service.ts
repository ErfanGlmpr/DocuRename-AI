import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      endpoint: this.configService.get<string>('S3_ENDPOINT'),
      region: this.configService.get<string>('S3_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('S3_SECRET_ACCESS_KEY') || '',
      },
      forcePathStyle:
        this.configService.get<string>('S3_FORCE_PATH_STYLE') === 'true',
    });
    this.bucket = this.configService.get<string>('S3_BUCKET') || '';
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to upload buffer to S3 key ${key}`, error);
      throw error;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      const stream = response.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to get object from S3 key ${key}`, error);
      throw error;
    }
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      await this.s3Client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${sourceKey}`,
          Key: destinationKey,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to copy object from ${sourceKey} to ${destinationKey}`,
        error,
      );
      throw error;
    }
  }

  async getPresignedDownloadUrl(key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    } catch (error) {
      this.logger.error(`Failed to get presigned URL for key ${key}`, error);
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to delete object from S3 key ${key}`, error);
      throw error;
    }
  }

  /** Lists all object keys in the bucket. Handles pagination automatically. */
  async listObjects(): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined = undefined;
    try {
      do {
        const response: ListObjectsV2CommandOutput = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            ContinuationToken: continuationToken,
          }),
        );
        if (response.Contents) {
          for (const item of response.Contents) {
            if (item.Key) keys.push(item.Key);
          }
        }
        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken);
      return keys;
    } catch (error) {
      this.logger.error(
        `Failed to list objects in bucket ${this.bucket}`,
        error,
      );
      throw error;
    }
  }

  /** Checks that the configured bucket is accessible. Used by HealthService. */
  async healthCheck(): Promise<void> {
    await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  onModuleDestroy() {
    this.s3Client.destroy();
  }
}
