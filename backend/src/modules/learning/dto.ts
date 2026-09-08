import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RevisionType, VideoProvider } from '@prisma/client';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class LearningFilterDto {
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() topicId?: string;
  @IsOptional() @IsString() subtopicId?: string;
  @IsOptional() @IsEnum(RevisionType) type?: RevisionType;
}

export class AdminContentListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() examId?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() topicId?: string;
  @IsOptional() @IsString() subtopicId?: string;
  @IsOptional() @Transform(toBoolean) @IsBoolean() isPublished?: boolean;
  @IsOptional() @Transform(toBoolean) @IsBoolean() isActive?: boolean;
  @IsOptional() @Transform(toBoolean) @IsBoolean() isPremium?: boolean;
}

export class AdminVideoListDto extends AdminContentListDto {
  @IsOptional() @IsEnum(VideoProvider) provider?: VideoProvider;
}

export class AdminRevisionListDto extends AdminContentListDto {
  @IsOptional() @IsEnum(RevisionType) type?: RevisionType;
}

export class VideoDto extends LearningFilterDto {
  @IsString() title!: string;
  @IsString() slug!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() examId!: string;
  @IsString() academicClassId!: string;
  @IsString() providerAssetId!: string;
  @IsOptional() @IsEnum(VideoProvider) provider?: VideoProvider;
  @IsOptional() @IsString() playbackId?: string;
  @IsOptional() @IsString() mediaAssetId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationSeconds?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() isFree?: boolean;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateVideoDto extends PartialType(VideoDto) {}

export class ProgressDto {
  @Type(() => Number) @IsInt() @Min(0) lastPositionSeconds!: number;
  @Type(() => Number) @IsInt() @Min(0) watchedSeconds!: number;
}

export class RevisionDto extends LearningFilterDto {
  @IsString() title!: string;
  @IsEnum(RevisionType) declare type: RevisionType;
  @IsString() content!: string;
  @IsString() examId!: string;
  @IsString() academicClassId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateRevisionDto extends PartialType(RevisionDto) {}
