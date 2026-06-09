import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RequestWithRequestId extends Request {
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithRequestId>();

    const requestId = request.requestId || 'unknown-request-id';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorType = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responsePayload = exception.getResponse();
      if (typeof responsePayload === 'string') {
        message = responsePayload;
      } else if (
        typeof responsePayload === 'object' &&
        responsePayload !== null
      ) {
        const payload = responsePayload as Record<string, unknown>;
        if (
          typeof payload.message === 'string' ||
          Array.isArray(payload.message)
        ) {
          message = payload.message as string | string[];
        }
        if (typeof payload.error === 'string') {
          errorType = payload.error;
        }
      }
    }

    if (Number(status) >= 500) {
      // For 500 errors, log the stack trace but scrub the response payload to clients
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} - ${status} - ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : '',
      );
    } else if (
      status === HttpStatus.UNAUTHORIZED ||
      status === HttpStatus.NOT_FOUND
    ) {
      // Downgrade expected auth checks and not found to debug to reduce noise
      this.logger.debug(
        `[${requestId}] ${request.method} ${request.url} - ${status} - ${JSON.stringify(
          message,
        )}`,
      );
    } else {
      // For other client errors (400-499), log the warning
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.url} - ${status} - ${JSON.stringify(
          message,
        )}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      error: errorType,
      requestId,
    });
  }
}
