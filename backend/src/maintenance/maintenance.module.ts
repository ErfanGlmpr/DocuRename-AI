import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { RetentionPolicyService } from './retention-policy.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  providers: [CleanupService, RetentionPolicyService],
  exports: [CleanupService, RetentionPolicyService],
})
export class MaintenanceModule {}
