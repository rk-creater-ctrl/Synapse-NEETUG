import { PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { StudentQuestionListDto } from './student-questions.dto';

export class QuestionPracticeFiltersDto extends PickType(StudentQuestionListDto, [
  'examId',
  'subjectId',
  'classId',
  'chapterId',
  'topicId',
  'subtopicId',
  'pyqOnly',
  'pyqYear',
  'difficulty',
  'tag',
] as const) {}

export class CreateQuestionPracticeSessionDto extends QuestionPracticeFiltersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  questionCount = 20;
}

export class ListQuestionPracticeSessionsDto {
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
}

export class AnswerQuestionPracticeItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  selectedOptionId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(14_400)
  timeSpentSeconds?: number;
}
