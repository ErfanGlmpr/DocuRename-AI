import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationAccessGuard } from '../auth/guards/organization-access.guard';
import { OrganizationRoleGuard } from '../auth/guards/organization-role.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OrganizationRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrganizationAccessGuard, OrganizationRoleGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Get organization statistics overview' })
  @ApiResponse({
    status: 200,
    description: 'Organization overview statistics retrieved successfully',
  })
  async getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.getOverview(user.organizationId);
  }
}
