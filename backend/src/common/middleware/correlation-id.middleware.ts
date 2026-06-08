import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let requestId = req.headers['x-request-id'];
    if (!requestId || Array.isArray(requestId)) {
      requestId = randomUUID();
    }

    // Set on request object for retrieval in filters/controllers
    Object.assign(req, { requestId });

    // Set on response headers
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
