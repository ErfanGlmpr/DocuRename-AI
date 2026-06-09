import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getMe: jest.fn(),
    switchOrganization: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should delegate to authService.register', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'StrongPass1!',
        name: 'Test',
      };
      const expectedResult = {
        accessToken: 'tok',
        refreshToken: 'ref',
        user: {},
      };

      mockAuthService.register.mockResolvedValue(expectedResult);

      const mockRes = { cookie: jest.fn() } as unknown as Response;
      const result = await controller.register(dto, mockRes);

      expect(result).toEqual({ accessToken: 'tok', user: {} });
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'ref',
        expect.any(Object),
      );
    });
  });

  describe('POST /auth/login', () => {
    it('should delegate to authService.login', async () => {
      const dto = { email: 'test@example.com', password: 'pass' };
      const expectedResult = {
        accessToken: 'tok',
        refreshToken: 'ref',
        user: {},
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const mockRes = { cookie: jest.fn() } as unknown as Response;
      const result = await controller.login(dto, mockRes);

      expect(result).toEqual({ accessToken: 'tok', user: {} });
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'ref',
        expect.any(Object),
      );
    });
  });

  describe('POST /auth/refresh', () => {
    it('should delegate to authService.refresh with the raw token', async () => {
      const expectedResult = {
        accessToken: 'new-tok',
        refreshToken: 'new-ref',
      };

      mockAuthService.refresh.mockResolvedValue(expectedResult);

      const mockReq = {
        cookies: { refresh_token: 'my-refresh-token' },
      } as unknown as Request;
      const mockRes = { cookie: jest.fn() } as unknown as Response;

      const result = await controller.refresh(mockReq, mockRes);

      expect(result).toEqual({ accessToken: 'new-tok' });
      expect(mockAuthService.refresh).toHaveBeenCalledWith('my-refresh-token');
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'new-ref',
        expect.any(Object),
      );
    });
  });

  describe('POST /auth/logout', () => {
    it('should call authService.logout with the user id and return success message', async () => {
      const currentUser = {
        id: 'user-1',
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'OWNER' as const,
      };
      mockAuthService.logout.mockResolvedValue(undefined);

      const mockRes = { clearCookie: jest.fn() } as unknown as Response;
      const result = await controller.logout(currentUser, mockRes);

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1');
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/auth',
      });
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('POST /auth/switch-organization', () => {
    it('should delegate to authService.switchOrganization', async () => {
      const currentUser = {
        id: 'user-1',
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'OWNER' as const,
      };
      const dto = { organizationId: 'org-2' };
      const expectedResult = {
        accessToken: 'new-tok',
        refreshToken: 'new-ref',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test',
          organizationId: 'org-2',
          organizationName: 'Org 2',
          role: 'MEMBER' as const,
        },
      };

      mockAuthService.switchOrganization.mockResolvedValue(expectedResult);

      const mockRes = { cookie: jest.fn() } as unknown as Response;
      const result = await controller.switchOrganization(
        currentUser,
        dto,
        mockRes,
      );

      const safeResult = {
        accessToken: 'new-tok',
        user: expectedResult.user,
      };
      expect(result).toEqual(safeResult);
      expect(mockAuthService.switchOrganization).toHaveBeenCalledWith(
        'user-1',
        'org-2',
      );
    });
  });

  describe('GET /auth/me', () => {
    it('should delegate to authService.getMe with the user id', async () => {
      const currentUser = {
        id: 'user-1',
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'OWNER' as const,
      };
      const profile = {
        id: 'user-1',
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'OWNER',
      };

      mockAuthService.getMe.mockResolvedValue(profile);

      const result = await controller.getMe(currentUser);

      expect(result).toEqual(profile);
      expect(mockAuthService.getMe).toHaveBeenCalledWith('user-1');
    });
  });
});
