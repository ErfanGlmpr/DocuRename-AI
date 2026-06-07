/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { OrganizationRole } from '@prisma/client';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      organization: {
        create: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Test Org' }),
      },
      organizationMember: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: {} },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOrganization', () => {
    it('should create an organization and assign the user as owner', async () => {
      const result = await service.createOrganization('user-1', {
        name: 'Test Org',
      });
      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'Test Org' },
      });
      expect(prisma.organizationMember.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          organizationId: 'org-1',
          role: OrganizationRole.OWNER,
        },
      });
      expect(result.id).toBe('org-1');
    });
  });

  describe('addMember', () => {
    it('should throw ForbiddenException if caller is not a member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.addMember('user-1', 'org-1', {
          email: 'test@test.com',
          role: OrganizationRole.MEMBER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if caller is a MEMBER', async () => {
      prisma.organizationMember.findUnique.mockResolvedValueOnce({
        role: OrganizationRole.MEMBER,
      });
      await expect(
        service.addMember('user-1', 'org-1', {
          email: 'test@test.com',
          role: OrganizationRole.MEMBER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if target user not found', async () => {
      prisma.organizationMember.findUnique.mockResolvedValueOnce({
        role: OrganizationRole.OWNER,
      });
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.addMember('user-1', 'org-1', {
          email: 'test@test.com',
          role: OrganizationRole.MEMBER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user is already a member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValueOnce({
        role: OrganizationRole.OWNER,
      }); // caller
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-2' }); // target
      prisma.organizationMember.findUnique.mockResolvedValueOnce({}); // existing membership
      await expect(
        service.addMember('user-1', 'org-1', {
          email: 'test@test.com',
          role: OrganizationRole.MEMBER,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully add a member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValueOnce({
        role: OrganizationRole.OWNER,
      }); // caller
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-2' }); // target
      prisma.organizationMember.findUnique.mockResolvedValueOnce(null); // existing membership
      prisma.organizationMember.create.mockResolvedValueOnce({ id: 'mem-1' });

      const result = await service.addMember('user-1', 'org-1', {
        email: 'test@test.com',
        role: OrganizationRole.MEMBER,
      });
      expect(result.message).toBe('Member added successfully');
      expect(prisma.organizationMember.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          organizationId: 'org-1',
          role: OrganizationRole.MEMBER,
        },
      });
    });
  });

  describe('getMembers', () => {
    it('should throw ForbiddenException if caller is not a member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.getMembers('user-1', 'org-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return a list of members if caller is a member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValueOnce({
        role: OrganizationRole.MEMBER,
      }); // caller
      prisma.organizationMember.findMany.mockResolvedValueOnce([
        {
          userId: 'user-2',
          organizationId: 'org-1',
          role: OrganizationRole.MEMBER,
          createdAt: new Date('2023-01-01'),
          user: { id: 'user-2', email: 'user2@example.com', name: 'User 2' },
        },
      ]);

      const result = await service.getMembers('user-1', 'org-1');
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('user2@example.com');
      expect(prisma.organizationMember.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
