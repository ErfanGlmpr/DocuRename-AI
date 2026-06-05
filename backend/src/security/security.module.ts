import { Module } from '@nestjs/common';
import { VirusScanService } from './virus-scan.service';

@Module({
  providers: [VirusScanService],
  exports: [VirusScanService],
})
export class SecurityModule {}
