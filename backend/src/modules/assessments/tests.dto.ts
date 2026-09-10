import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TestSectionQuestionDto {
  @IsString()
  questionId!: string;

  @IsInt()
  @Min(0)
  displayOrder!: number;

  @IsNumber()
  @Min(0)
  marks!: number;

  @IsNumber()
  @Min(0)
  negativeMarks!: number;
}

export class TestSectionDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @IsInt()
  @Min(0)
  displayOrder!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestSectionQuestionDto)
  questions!: TestSectionQuestionDto[];
}

export class CreateTestDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @IsString()
  examId!: string;

  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  academicClassId?: string | null;

  @IsOptional()
  @IsString()
  chapterId?: string | null;

  @IsOptional()
  @IsString()
  topicId?: string | null;

  @IsOptional()
  @IsString()
  subtopicId?: string | null;

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsDateString()
  availableFrom?: string | null;

  @IsOptional()
  @IsDateString()
  availableUntil?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TestSectionDto)
  sections!: TestSectionDto[];
}

export class UpdateTestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string | null;

  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  academicClassId?: string | null;

  @IsOptional()
  @IsString()
  chapterId?: string | null;

  @IsOptional()
  @IsString()
  topicId?: string | null;

  @IsOptional()
  @IsString()
  subtopicId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsDateString()
  availableFrom?: string | null;

  @IsOptional()
  @IsDateString()
  availableUntil?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TestSectionDto)
  sections?: TestSectionDto[];
}

export class AdminTestListQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  academicClassId?: string;

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
  @Type(() => Boolean)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsString()
  availability?: 'SCHEDULED' | 'AVAILABLE' | 'ENDED';
}
