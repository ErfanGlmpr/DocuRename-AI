import { Injectable, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MetricsAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic =
      this.configService.get<string>('METRICS_PUBLIC') !== 'false';
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const expectedToken = this.configService.get<string>('METRICS_TOKEN');
    const providedToken = request.headers['x-metrics-token'] as
      | string
      | undefined;

    if (expectedToken && providedToken === expectedToken) {
      return true;
    }

    return super.canActivate(context);
  }
}
