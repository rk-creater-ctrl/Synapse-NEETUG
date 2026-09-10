import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { DailyStudyQueryDto, UpdateDailyStudyTaskStatusDto } from './daily-study.dto';
import { DailyStudyService } from './daily-study.service';

@Controller('learning/daily-study')
@UseGuards(JwtAuthGuard)
export class DailyStudyController {
  constructor(private readonly dailyStudy: DailyStudyService) {}

  @Get()
  get(
    @Req() request: { user: { id: string } },
    @Query() query: DailyStudyQueryDto,
  ) {
    return this.dailyStudy.getOrGenerateDailyModule(request.user.id, query.date);
  }

  @Patch('tasks/:taskId/status')
  updateTaskStatus(
    @Req() request: { user: { id: string } },
    @Param('taskId') taskId: string,
    @Body() dto: UpdateDailyStudyTaskStatusDto,
  ) {
    return this.dailyStudy.updateTaskStatus(request.user.id, taskId, dto.status);
  }
}
