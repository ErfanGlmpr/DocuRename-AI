import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, StorageModule, QueueModule, ConfigModule],
  providers: [UploadsService],
  controllers: [UploadsController]
})
export class UploadsModule {}
