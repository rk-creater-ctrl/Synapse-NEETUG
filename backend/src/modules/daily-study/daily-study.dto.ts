import { IsDateString, IsEnum } from 'class-validator';
import { DailyStudyTaskStatus } from '@prisma/client';

export class DailyStudyQueryDto {
  @IsDateString()
  date!: string;
}

export class UpdateDailyStudyTaskStatusDto {
  @IsEnum(DailyStudyTaskStatus)
  status!: DailyStudyTaskStatus;
}
