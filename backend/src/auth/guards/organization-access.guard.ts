import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Guard that verifies the authenticated user is a member of the target organization.
 *
 * Reads the organization ID from (in priority order):
 *   1. `req.params.organizationId`
 *   2. `req.body.organizationId`
 *   3. `req.query.organizationId`
 *
 * Falls back to comparing against the user's own JWT-embedded organizationId
 * when none of the above are present.
 *
 * Must be used **after** `JwtAuthGuard` so that `req.user` is populated.
 *
 * @example
 * @UseGuards(JwtAuthGuard, OrganizationAccessGuard)
 * @Get(':organizationId/documents')
 * listDocuments(@CurrentUser() user: AuthenticatedUser) { ... }
 */
@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
      params: Record<string, string>;
      body: Record<string, unknown>;
      query: Record<string, string>;
    }>();

    const user: AuthenticatedUser = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Resolve the target organization from route params, body, or query
    const targetOrgId: string =
      request.params?.organizationId ??
      (request.body?.organizationId as string | undefined) ??
      request.query?.organizationId ??
      user.organizationId;

    await this.authService.assertOrganizationMember(user.id, targetOrgId);

    return true;
  }
}
