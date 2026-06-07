import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Acme Corp',
    description: 'The name of the new organization',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;
}
