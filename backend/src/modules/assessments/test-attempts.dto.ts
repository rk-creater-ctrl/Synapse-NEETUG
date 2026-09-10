import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SaveTestAttemptAnswerDto {
  @IsOptional()
  @IsString()
  selectedOptionId?: string | null;

  @IsOptional()
  @IsBoolean()
  markForReview?: boolean;
}
