import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Guard that verifies the authenticated user has one of the required roles
 * in their current organization.
 *
 * Must be used **after** `JwtAuthGuard` so that `req.user` is populated.
 * Depends on `user.role` being embedded in the JWT and populated by `JwtAuthGuard`.
 *
 * @example
 * @UseGuards(JwtAuthGuard, OrganizationRoleGuard)
 * @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
 * @Get('admin')
 * adminRoute() { ... }
 */
@Injectable()
export class OrganizationRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
    }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'You do not have the required role to perform this action',
      );
    }

    return true;
  }
}
