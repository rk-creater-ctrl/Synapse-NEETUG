import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  QuestionDifficulty,
  QuestionSourceType,
  QuestionType,
} from '@prisma/client';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class QuestionOptionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  position!: number;

  @IsString()
  @Length(1, 10_000)
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class QuestionPyqMetadataDto {
  @IsString()
  @Length(1, 120)
  sourceExam!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;

  @IsString()
  @Length(1, 120)
  sessionKey!: string;

  @IsString()
  @Length(1, 120)
  paperKey!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  questionNumber!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  sourceNote?: string;
}

export class QuestionDto {
  @IsEnum(QuestionType)
  type: QuestionType = QuestionType.SINGLE_CORRECT_MCQ;

  @IsEnum(QuestionSourceType)
  sourceType: QuestionSourceType = QuestionSourceType.CURATED;

  @IsString()
  @Length(1, 20_000)
  stem!: string;

  @IsString()
  @Length(1, 30_000)
  explanation!: string;

  @IsEnum(QuestionDifficulty)
  difficulty: QuestionDifficulty = QuestionDifficulty.MEDIUM;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @ArrayMaxSize(30)
  tags: string[] = [];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  importKey?: string | null;

  @IsString()
  examId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  academicClassId!: string;

  @IsString()
  chapterId!: string;

  @IsString()
  topicId!: string;

  @IsOptional()
  @IsString()
  subtopicId?: string | null;

  @IsOptional()
  @IsString()
  mediaAssetId?: string | null;

  @IsOptional()
  @IsString()
  solutionVideoId?: string | null;

  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options!: QuestionOptionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionPyqMetadataDto)
  pyqMetadata?: QuestionPyqMetadataDto | null;
}

export class UpdateQuestionDto extends PartialType(QuestionDto) {}

export class AdminQuestionListDto {
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
  @IsString()
  @Length(1, 500)
  search?: string;

  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  chapterId?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsString()
  subtopicId?: string;

  @IsOptional()
  @IsEnum(QuestionSourceType)
  sourceType?: QuestionSourceType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  pyqYear?: number;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  pyqSourceExam?: string;

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasMediaAsset?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasSolutionVideo?: boolean;
}
