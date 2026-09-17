import { CommunityMemberRole, CommunityType, CommunityVisibility } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class CreateCommunityDto {
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsEnum(CommunityType)
  type!: CommunityType;

  @IsEnum(CommunityVisibility)
  visibility!: CommunityVisibility;
}

export class AddCommunityMemberDto {
  @IsString()
  @Length(1, 191)
  userId!: string;
}

export class UpdateCommunityMemberRoleDto {
  @IsEnum(CommunityMemberRole)
  role!: CommunityMemberRole;
}
