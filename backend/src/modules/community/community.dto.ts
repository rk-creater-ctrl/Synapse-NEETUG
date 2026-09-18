import { CommunityMemberRole, CommunityReactionType, CommunityType, CommunityVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

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

export class CreateCommunityMessageDto {
  @IsString()
  @Length(1, 4000)
  content!: string;

  @IsOptional()
  @IsString()
  @Length(1, 191)
  replyToMessageId?: string;
}

export class CreateCommunityMessageWithAttachmentsDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsString()
  @Length(1, 191)
  replyToMessageId?: string;
}

export class SetCommunityMessageReactionDto {
  @IsEnum(CommunityReactionType)
  type!: CommunityReactionType;
}

export class CommunityMessageHistoryQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 191)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
