import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EncryptedPayload } from './pii.types';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.validateKey();
  }

  private validateKey() {
    const keyBase64 = this.configService.get<string>('PII_ENCRYPTION_KEY');
    if (!keyBase64) {
      this.logger.warn('PII_ENCRYPTION_KEY is not set. Encryption will fail.');
      return;
    }

    try {
      this.encryptionKey = Buffer.from(keyBase64, 'base64');
      if (this.encryptionKey.length !== 32) {
        throw new Error(
          'Key must be 32 bytes (base64 encoded string length should be around 44 chars).',
        );
      }
    } catch (error) {
      this.logger.error('Invalid PII_ENCRYPTION_KEY', (error as Error).message);
      throw error;
    }
  }

  encrypt(plaintext: string): EncryptedPayload {
    if (!this.encryptionKey) {
      this.validateKey();
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      this.algorithm,
      this.encryptionKey,
      iv,
    );

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      algorithm: this.algorithm,
      iv: iv.toString('hex'),
      authTag,
      ciphertext,
    };
  }

  decrypt(payload: EncryptedPayload): string {
    if (!this.encryptionKey) {
      this.validateKey();
    }

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(payload.iv, 'hex'),
    );

    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));

    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
