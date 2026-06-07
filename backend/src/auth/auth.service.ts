import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OrganizationRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserContext {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserContext;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new user, create a default organization, assign OWNER role.
   * Returns tokens and safe user context.
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const orgName = dto.name
      ? `${dto.name}'s Organization`
      : `${dto.email.split('@')[0]}'s Organization`;

    // Atomic: create user + org + membership in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name ?? null,
          passwordHash,
        },
      });

      const org = await tx.organization.create({
        data: { name: orgName },
      });

      const membership = await tx.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: OrganizationRole.OWNER,
        },
      });

      return { user, org, membership };
    });

    const tokens = await this.generateAndStoreTokens(result.user.id, {
      sub: result.user.id,
      email: result.user.email,
      organizationId: result.org.id,
      role: OrganizationRole.OWNER,
    });

    this.logger.log(`New user registered: ${result.user.email}`);

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        organizationId: result.org.id,
        organizationName: result.org.name,
        role: OrganizationRole.OWNER,
      },
    };
  }

  /**
   * Validate email/password credentials. Returns minimal user info or null.
   * Never logs passwords.
   */
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Constant-time comparison to prevent timing attacks
      await bcrypt.compare(password, '$2b$12$invalidhashforenumeration');
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    return { id: user.id, email: user.email };
  }

  /**
   * Login: validate credentials, load org context, return tokens.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.validateCredentials(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponseForUser(user.id);
  }

  /**
   * Refresh: validate refresh token, compare hash, rotate tokens.
   */
  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    let payload: {
      sub: string;
      email: string;
      organizationId: string;
      role: OrganizationRole;
    };

    try {
      const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
      payload = this.jwtService.verify<typeof payload>(rawRefreshToken, {
        secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const isMatch = await bcrypt.compare(
      rawRefreshToken,
      user.refreshTokenHash,
    );
    if (!isMatch) {
      throw new UnauthorizedException('Refresh token has been invalidated');
    }

    const tokens = await this.generateAndStoreTokens(user.id, {
      sub: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
    });

    return tokens;
  }

  /**
   * Logout: clear stored refresh token hash.
   */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  /**
   * Get current user's safe profile with org and role.
   * Never returns passwordHash or refreshTokenHash.
   */
  async getMe(userId: string): Promise<UserContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { organization: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new NotFoundException('No organization membership found for user');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      role: membership.role,
    };
  }

  // ─── Organization helpers ───────────────────────────────────────────────────

  /**
   * Asserts that `userId` is an active member of `organizationId`.
   * Throws `ForbiddenException` if the membership does not exist.
   * Used by `OrganizationAccessGuard` and service-layer tenant checks.
   */
  async assertOrganizationMember(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }
  }

  /**
   * Returns the earliest organization the user is a member of.
   * Throws `NotFoundException` if the user has no memberships.
   */
  async getDefaultOrganizationForUser(userId: string): Promise<{
    organizationId: string;
    organizationName: string;
    role: string;
  }> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { organization: true },
    });

    if (!membership) {
      throw new NotFoundException('No organization membership found for user');
    }

    return {
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      role: membership.role,
    };
  }

  /**
   * Returns full membership context for the user (all organizations + roles).
   * Ordered by `createdAt` ascending; first entry is the default/primary org.
   */
  async getUserMembershipContext(
    userId: string,
  ): Promise<
    Array<{ organizationId: string; organizationName: string; role: string }>
  > {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { organization: true },
    });

    return memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      role: m.role,
    }));
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async buildAuthResponseForUser(
    userId: string,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { organization: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new NotFoundException('No organization membership found');
    }

    const tokens = await this.generateAndStoreTokens(userId, {
      sub: userId,
      email: user.email,
      organizationId: membership.organizationId,
      role: membership.role,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        role: membership.role,
      },
    };
  }

  private async generateAndStoreTokens(
    userId: string,
    payload: {
      sub: string;
      email: string;
      organizationId: string;
      role: OrganizationRole;
    },
  ): Promise<TokenPair> {
    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const accessExpiresIn = (this.configService.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
    ) ?? '15m') as StringValue;
    const refreshExpiresIn = (this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) ?? '7d') as StringValue;

    const accessToken = this.jwtService.sign(payload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn,
    });

    // Hash the refresh token before storing (never store raw tokens)
    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken };
  }
}
