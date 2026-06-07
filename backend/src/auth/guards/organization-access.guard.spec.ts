import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OrganizationAccessGuard } from './organization-access.guard';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';

const mockAuthService = {
  assertOrganizationMember: jest.fn(),
};

function buildContext(options: {
  user?: AuthenticatedUser | null;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): ExecutionContext {
  const request = {
    user: options.user ?? undefined,
    params: options.params ?? {},
    body: options.body ?? {},
    query: options.query ?? {},
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

const authenticatedUser: AuthenticatedUser = {
  id: 'user-1',
  email: 'user@example.com',
  organizationId: 'org-1',
  role: 'OWNER',
};

describe('OrganizationAccessGuard', () => {
  let guard: OrganizationAccessGuard;

  beforeEach(() => {
    guard = new OrganizationAccessGuard(
      mockAuthService as unknown as AuthService,
    );
    jest.clearAllMocks();
  });

  it('should allow access when user is a member of the organization in params', async () => {
    mockAuthService.assertOrganizationMember.mockResolvedValue(undefined);

    const ctx = buildContext({
      user: authenticatedUser,
      params: { organizationId: 'org-2' },
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockAuthService.assertOrganizationMember).toHaveBeenCalledWith(
      'user-1',
      'org-2',
    );
  });

  it('should resolve org from body when not present in params', async () => {
    mockAuthService.assertOrganizationMember.mockResolvedValue(undefined);

    const ctx = buildContext({
      user: authenticatedUser,
      body: { organizationId: 'org-body' },
    });

    await guard.canActivate(ctx);

    expect(mockAuthService.assertOrganizationMember).toHaveBeenCalledWith(
      'user-1',
      'org-body',
    );
  });

  it('should resolve org from query when not present in params or body', async () => {
    mockAuthService.assertOrganizationMember.mockResolvedValue(undefined);

    const ctx = buildContext({
      user: authenticatedUser,
      query: { organizationId: 'org-query' },
    });

    await guard.canActivate(ctx);

    expect(mockAuthService.assertOrganizationMember).toHaveBeenCalledWith(
      'user-1',
      'org-query',
    );
  });

  it('should fall back to jwt organizationId when no org id in request', async () => {
    mockAuthService.assertOrganizationMember.mockResolvedValue(undefined);

    const ctx = buildContext({ user: authenticatedUser });

    await guard.canActivate(ctx);

    expect(mockAuthService.assertOrganizationMember).toHaveBeenCalledWith(
      'user-1',
      'org-1',
    );
  });

  it('should throw ForbiddenException when user is not a member', async () => {
    mockAuthService.assertOrganizationMember.mockRejectedValue(
      new ForbiddenException('You do not have access to this organization'),
    );

    const ctx = buildContext({
      user: authenticatedUser,
      params: { organizationId: 'other-org' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when no user is present on request', async () => {
    const ctx = buildContext({ user: null });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Authentication required',
    );
  });
});
