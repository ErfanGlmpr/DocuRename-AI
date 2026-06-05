import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');
const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      create: jest.fn(),
    },
    organizationMember: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create a user, organisation and membership, then return tokens and safe user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcryptMock.hash as jest.Mock).mockResolvedValue('hashedPassword');

      const createdUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      };
      const createdOrg = { id: 'org-1', name: "Test User's Organization" };
      const createdMembership = {
        id: 'mem-1',
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      };

      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          const txMock = {
            user: { create: jest.fn().mockResolvedValue(createdUser) },
            organization: { create: jest.fn().mockResolvedValue(createdOrg) },
            organizationMember: {
              create: jest.fn().mockResolvedValue(createdMembership),
            },
          };
          return fn(txMock as unknown as typeof mockPrisma);
        },
      );

      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');
      (bcryptMock.hash as jest.Mock)
        .mockResolvedValueOnce('hashedPassword')
        .mockResolvedValueOnce('hashedRefreshToken');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.register({
        email: 'test@example.com',
        password: 'StrongPassword1!',
        name: 'Test User',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('OWNER');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('refreshTokenHash');
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({
          email: 'taken@example.com',
          password: 'StrongPassword1!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('validateCredentials', () => {
    it('should return user data when credentials are valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
      });
      (bcryptMock.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateCredentials(
        'test@example.com',
        'correct-password',
      );

      expect(result).toEqual({ id: 'user-1', email: 'test@example.com' });
    });

    it('should return null when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
      });
      (bcryptMock.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateCredentials(
        'test@example.com',
        'wrong-password',
      );

      expect(result).toBeNull();
    });

    it('should return null and still do a hash comparison when user does not exist (timing attack prevention)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcryptMock.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateCredentials(
        'nonexistent@example.com',
        'password',
      );

      expect(result).toBeNull();
      expect(bcryptMock.compare).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should return tokens and user context on valid credentials', async () => {
      const validUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        memberships: [
          {
            organizationId: 'org-1',
            role: 'OWNER',
            createdAt: new Date(),
            organization: { id: 'org-1', name: 'Test Org' },
          },
        ],
      };

      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'test@example.com',
          passwordHash: 'hashed',
        }) // validateCredentials
        .mockResolvedValueOnce(validUser); // buildAuthResponseForUser

      (bcryptMock.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');
      (bcryptMock.hash as jest.Mock).mockResolvedValue('hashed-refresh');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.login({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.user.organizationId).toBe('org-1');
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
      });
      (bcryptMock.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should rotate refresh token and return new tokens', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'OWNER',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        refreshTokenHash: 'stored-hash',
      });

      (bcryptMock.compare as jest.Mock).mockResolvedValue(true);
      (bcryptMock.hash as jest.Mock).mockResolvedValue('new-hash');
      mockJwtService.sign
        .mockReturnValueOnce('new-access')
        .mockReturnValueOnce('new-refresh');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.refresh('valid-refresh-token');

      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
    });

    it('should throw UnauthorizedException if token is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if hash does not match (token reuse)', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'OWNER',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        refreshTokenHash: 'stored-hash',
      });

      (bcryptMock.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.refresh('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should clear the refresh token hash', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await service.logout('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: null },
      });
    });
  });

  describe('getMe', () => {
    it('should return user profile without sensitive fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'NEVER_EXPOSE_THIS',
        refreshTokenHash: 'NEVER_EXPOSE_THIS_EITHER',
        memberships: [
          {
            organizationId: 'org-1',
            role: 'OWNER',
            createdAt: new Date(),
            organization: { id: 'org-1', name: 'Test Org' },
          },
        ],
      });

      const result = await service.getMe('user-1');

      expect(result.email).toBe('test@example.com');
      expect(result.organizationId).toBe('org-1');
      expect(result.role).toBe('OWNER');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('refreshTokenHash');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
