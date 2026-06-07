/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationRole } from '@prisma/client';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let service: any;

  beforeEach(async () => {
    service = {
      createOrganization: jest
        .fn()
        .mockResolvedValue({ id: 'org-1', name: 'Test Org' }),
      addMember: jest
        .fn()
        .mockResolvedValue({ message: 'Member added successfully' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: service }],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call createOrganization', async () => {
    const result = await controller.createOrganization(
      { id: 'user-1' } as any,
      { name: 'Test Org' },
    );
    expect(service.createOrganization).toHaveBeenCalledWith('user-1', {
      name: 'Test Org',
    });
    expect(result).toEqual({ id: 'org-1', name: 'Test Org' });
  });

  it('should call addMember', async () => {
    const result = await controller.addMember(
      { id: 'user-1' } as any,
      'org-1',
      { email: 'test@test.com', role: OrganizationRole.MEMBER },
    );
    expect(service.addMember).toHaveBeenCalledWith('user-1', 'org-1', {
      email: 'test@test.com',
      role: OrganizationRole.MEMBER,
    });
    expect(result).toEqual({ message: 'Member added successfully' });
  });

  it('should call getMembers', async () => {
    service.getMembers = jest
      .fn()
      .mockResolvedValue([{ email: 'test@test.com' }]);
    const result = await controller.getMembers(
      { id: 'user-1' } as any,
      'org-1',
    );
    expect(service.getMembers).toHaveBeenCalledWith('user-1', 'org-1');
    expect(result).toEqual([{ email: 'test@test.com' }]);
  });
});
