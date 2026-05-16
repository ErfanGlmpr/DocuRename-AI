import { Global, Module } from '@nestjs/common';
import { CancellationService } from './cancellation.service';

@Global()
@Module({
  providers: [CancellationService],
  exports: [CancellationService],
})
export class CancellationModule {}
