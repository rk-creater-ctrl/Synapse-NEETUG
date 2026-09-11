import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CreateStudySessionDto } from './study-sessions.dto';
import { StudySessionsService } from './study-sessions.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('student study sessions')
@ApiBearerAuth()
@Controller('learning/study-sessions')
@UseGuards(JwtAuthGuard)
export class StudySessionsController {
  constructor(private readonly sessions: StudySessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Start an authenticated student study timer session' })
  start(@Req() request: AuthenticatedRequest, @Body() dto: CreateStudySessionDto) {
    return this.sessions.start(request.user.id, dto);
  }

  @Get('current')
  @ApiOperation({ summary: 'Get the authenticated student current study timer session' })
  current(@Req() request: AuthenticatedRequest) {
    return this.sessions.current(request.user.id);
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get an authenticated student study timer session' })
  get(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.sessions.get(request.user.id, sessionId);
  }

  @Post(':sessionId/pause')
  @ApiOperation({ summary: 'Pause an authenticated student study timer session' })
  pause(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.sessions.pause(request.user.id, sessionId);
  }

  @Post(':sessionId/resume')
  @ApiOperation({ summary: 'Resume an authenticated student study timer session' })
  resume(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.sessions.resume(request.user.id, sessionId);
  }

  @Post(':sessionId/complete')
  @ApiOperation({ summary: 'Complete an authenticated student study timer session' })
  complete(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.sessions.complete(request.user.id, sessionId);
  }

  @Post(':sessionId/abandon')
  @ApiOperation({ summary: 'Abandon an authenticated student study timer session' })
  abandon(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.sessions.abandon(request.user.id, sessionId);
  }
}
