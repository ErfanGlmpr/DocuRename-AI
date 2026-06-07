import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { OrganizationRole } from '@prisma/client';

export class AddMemberDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address of the user to invite/add',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    enum: OrganizationRole,
    example: OrganizationRole.MEMBER,
    description: 'Role to assign to the user',
  })
  @IsNotEmpty()
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
