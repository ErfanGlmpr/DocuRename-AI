import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationAccessGuard } from '../auth/guards/organization-access.guard';
import { OrganizationRoleGuard } from '../auth/guards/organization-role.guard';
import { OrganizationRole } from '@prisma/client';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;

  beforeEach(async () => {
    adminService = {
      getOverview: jest.fn(),
    } as unknown as jest.Mocked<AdminService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: adminService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OrganizationAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OrganizationRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOverview', () => {
    it('should call adminService.getOverview with the users organizationId', async () => {
      const mockOverview = {
        documentCountsByStatus: {},
        failedDocumentCount: 0,
        processingDocumentCount: 0,
        averageProcessingDuration: 0,
        providerUsageCounts: {},
        ocrUsageCount: 0,
        virusScanFailures: 0,
      };
      adminService.getOverview.mockResolvedValue(mockOverview);

      const user = {
        id: 'user-1',
        email: 'test@test.com',
        name: 'Test',
        organizationId: 'org-1',
        organizationName: 'Org 1',
        role: OrganizationRole.ADMIN,
      };

      const result = await controller.getOverview(user);

      expect(adminService.getOverview).toHaveBeenCalledWith('org-1');
      expect(result).toEqual(mockOverview);
    });
  });
});
