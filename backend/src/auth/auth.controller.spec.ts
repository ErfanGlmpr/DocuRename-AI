import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getMe: jest.fn(),
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

      const result = await controller.register(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
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

      const result = await controller.login(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should delegate to authService.refresh with the raw token', async () => {
      const dto = { refreshToken: 'my-refresh-token' };
      const expectedResult = {
        accessToken: 'new-tok',
        refreshToken: 'new-ref',
      };

      mockAuthService.refresh.mockResolvedValue(expectedResult);

      const result = await controller.refresh(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.refresh).toHaveBeenCalledWith('my-refresh-token');
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

      const result = await controller.logout(currentUser);

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ message: 'Logged out successfully' });
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
