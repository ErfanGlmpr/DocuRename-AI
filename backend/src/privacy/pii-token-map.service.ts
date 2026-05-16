import { Injectable } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { PiiTokenValue, EncryptedPayload } from './pii.types';

@Injectable()
export class PiiTokenMapService {
  constructor(private readonly encryptionService: EncryptionService) {}

  async encryptTokenMap(
    tokenMap: Record<string, PiiTokenValue>,
  ): Promise<EncryptedPayload> {
    await Promise.resolve();
    const json = JSON.stringify(tokenMap);
    return this.encryptionService.encrypt(json);
  }

  async decryptTokenMap(
    payload: EncryptedPayload,
  ): Promise<Record<string, PiiTokenValue>> {
    await Promise.resolve();
    const json = this.encryptionService.decrypt(payload);
    return JSON.parse(json) as Record<string, PiiTokenValue>;
  }
}
