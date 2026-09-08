import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { FlashcardReviewResult } from '@prisma/client';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class FlashcardFilterDto {
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() topicId?: string;
  @IsOptional() @IsString() subtopicId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class AdminFlashcardListDto {
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

export class ReviewDto {
  @IsEnum(FlashcardReviewResult)
  result!: FlashcardReviewResult;
}

export class FlashcardDto extends FlashcardFilterDto {
  @IsOptional() @IsString() title?: string;
  @IsString() frontContent!: string;
  @IsString() backContent!: string;
  @IsOptional() @IsString() explanation?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() mediaAssetId?: string | null;
  @IsString() examId!: string;
  @IsString() academicClassId!: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPremium?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateFlashcardDto extends PartialType(FlashcardDto) {}
