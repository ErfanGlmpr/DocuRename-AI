import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './types/authenticated-user.type';

/**
 * Parameter decorator that extracts the authenticated user from the request.
 * Must be used on routes protected by JwtAuthGuard.
 *
 * @example
 * async getProfile(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
