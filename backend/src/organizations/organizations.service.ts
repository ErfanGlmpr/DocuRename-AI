import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationRole } from '@prisma/client';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: dto.name },
      });

      await tx.organizationMember.create({
        data: {
          userId,
          organizationId: org.id,
          role: OrganizationRole.OWNER,
        },
      });

      return org;
    });
  }

  async addMember(callerId: string, organizationId: string, dto: AddMemberDto) {
    // Check if caller is OWNER or ADMIN
    const callerMembership = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: callerId,
          organizationId,
        },
      },
    });

    if (!callerMembership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    if (
      callerMembership.role !== OrganizationRole.OWNER &&
      callerMembership.role !== OrganizationRole.ADMIN
    ) {
      throw new ForbiddenException('Only owners and admins can add members');
    }

    // Find the target user
    const targetUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with email ${dto.email} not found`);
    }

    // Check if already a member
    const existingMembership = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUser.id,
          organizationId,
        },
      },
    });

    if (existingMembership) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    const membership = await this.prisma.organizationMember.create({
      data: {
        userId: targetUser.id,
        organizationId,
        role: dto.role,
      },
    });

    return {
      message: 'Member added successfully',
      membership,
    };
  }

  async getMembers(callerId: string, organizationId: string) {
    // Check if caller is a member
    const callerMembership = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: callerId,
          organizationId,
        },
      },
    });

    if (!callerMembership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }
}
