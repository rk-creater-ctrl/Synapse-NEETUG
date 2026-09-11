import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { StudyAnalyticsService } from './study-analytics.service';

@ApiTags('student study analytics')
@ApiBearerAuth()
@Controller('learning/study-analytics')
@UseGuards(JwtAuthGuard)
export class StudyAnalyticsController {
  constructor(private readonly analytics: StudyAnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Get personal authenticated student study analytics' })
  summary(@Req() request: { user: { id: string } }) {
    return this.analytics.summary(request.user.id);
  }
}
