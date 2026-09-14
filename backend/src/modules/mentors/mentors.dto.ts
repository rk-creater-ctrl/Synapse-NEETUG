import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateMentorDto {
  @IsString()
  @Length(1, 191)
  userId!: string;

  @IsString()
  @Length(1, 200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  headline?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  bio?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(1, 2048)
  profileImageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  experienceYears?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  subjectIds!: string[];
}

export class UpdateMentorDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  headline?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  bio?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(1, 2048)
  profileImageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  experienceYears?: number;
}

export class UpdateMentorStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class ReplaceMentorSubjectsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  subjectIds!: string[];
}

export class MentorListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 191)
  subjectId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;
}

export class StudentMentorListQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 191)
  subjectId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;
}

export class MentorBookableSlotsQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class CreateMentorBookingDto {
  @IsString()
  @Length(1, 191)
  mentorId!: string;

  @IsString()
  @Length(20, 40)
  scheduledStartAt!: string;
}

export class MentorBookingListQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['upcoming', 'past', 'all'])
  scope?: 'upcoming' | 'past' | 'all';
}

export class MentorAvailabilitySlotDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class ReplaceMentorAvailabilityDto {
  @IsString()
  @Length(1, 100)
  timezone!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MentorAvailabilitySlotDto)
  slots!: MentorAvailabilitySlotDto[];
}
