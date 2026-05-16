import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CancellationService {
  private readonly logger = new Logger(CancellationService.name);
  private readonly controllers = new Map<string, AbortController>();

  register(documentId: string): AbortSignal {
    const controller = new AbortController();
    this.controllers.set(documentId, controller);
    this.logger.debug(`Registered AbortController for document ${documentId}`);
    return controller.signal;
  }

  unregister(documentId: string): void {
    this.controllers.delete(documentId);
    this.logger.debug(
      `Unregistered AbortController for document ${documentId}`,
    );
  }

  cancel(documentId: string): boolean {
    const controller = this.controllers.get(documentId);
    if (controller) {
      controller.abort();
      this.controllers.delete(documentId);
      this.logger.log(`Aborted processing for document ${documentId}`);
      return true;
    }
    return false;
  }
}
