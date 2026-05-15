import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [PrismaModule, StorageModule, QueueModule],
  providers: [DocumentsService],
  controllers: [DocumentsController]
})
export class DocumentsModule {}
