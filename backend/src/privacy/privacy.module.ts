import { Module } from '@nestjs/common';
import { PiiDetectionService } from './pii-detection.service';
import { PiiRedactionService } from './pii-redaction.service';
import { EncryptionService } from './encryption.service';
import { PiiTokenMapService } from './pii-token-map.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [
    PiiDetectionService,
    PiiRedactionService,
    EncryptionService,
    PiiTokenMapService,
  ],
  exports: [
    PiiDetectionService,
    PiiRedactionService,
    EncryptionService,
    PiiTokenMapService,
  ],
})
export class PrivacyModule {}
