import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import {
  AnswerQuestionPracticeItemDto,
  CreateQuestionPracticeSessionDto,
  ListQuestionPracticeSessionsDto,
} from './practice-sessions.dto';
import { QuestionPracticeSessionsService } from './practice-sessions.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('student question practice')
@ApiBearerAuth()
@Controller('learning/question-practice-sessions')
@UseGuards(JwtAuthGuard)
export class QuestionPracticeSessionsController {
  constructor(private readonly sessions: QuestionPracticeSessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an authenticated student QBank practice session' })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateQuestionPracticeSessionDto) {
    return this.sessions.create(request.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current student QBank practice history' })
  list(@Req() request: AuthenticatedRequest, @Query() dto: ListQuestionPracticeSessionsDto) {
    return this.sessions.list(request.user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a current student QBank practice session safely' })
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.sessions.get(request.user.id, id);
  }

  @Post(':id/items/:itemId/answer')
  @ApiOperation({ summary: 'Answer one QBank practice item' })
  answer(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: AnswerQuestionPracticeItemDto,
  ) {
    return this.sessions.answer(request.user.id, id, itemId, dto);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete a QBank practice session' })
  complete(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.sessions.complete(request.user.id, id);
  }
}
