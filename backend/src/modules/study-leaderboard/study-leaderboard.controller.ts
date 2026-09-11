import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { StudyLeaderboardService } from './study-leaderboard.service';

@ApiTags('student study leaderboard')
@ApiBearerAuth()
@Controller('learning/study-leaderboard')
@UseGuards(JwtAuthGuard)
export class StudyLeaderboardController {
  constructor(private readonly leaderboard: StudyLeaderboardService) {}

  @Get('daily')
  @ApiOperation({ summary: 'Get the current UTC daily student study leaderboard' })
  daily(@Req() request: { user: { id: string } }) {
    return this.leaderboard.daily(request.user.id);
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Get the current UTC weekly student study leaderboard' })
  weekly(@Req() request: { user: { id: string } }) {
    return this.leaderboard.weekly(request.user.id);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Get the current UTC monthly student study leaderboard' })
  monthly(@Req() request: { user: { id: string } }) {
    return this.leaderboard.monthly(request.user.id);
  }
}
