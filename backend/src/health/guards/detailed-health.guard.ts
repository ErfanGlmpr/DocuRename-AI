import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DetailedHealthGuard extends AuthGuard('jwt') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic =
      this.configService.get<string>('HEALTH_DETAILED_PUBLIC') === 'true';
    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
