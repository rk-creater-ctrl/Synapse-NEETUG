import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { StudySessionContextType } from '@prisma/client';

export class CreateStudySessionDto {
  @IsOptional()
  @IsEnum(StudySessionContextType)
  contextType: StudySessionContextType = StudySessionContextType.GENERAL;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  chapterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  topicId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  subtopicId?: string;
}
