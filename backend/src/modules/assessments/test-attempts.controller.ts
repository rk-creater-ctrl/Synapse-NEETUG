import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { SaveTestAttemptAnswerDto } from './test-attempts.dto';
import { TestAttemptsService } from './test-attempts.service';

type AuthenticatedRequest = {
  user: {
    id: string;
  };
};

@Controller('learning')
@UseGuards(JwtAuthGuard)
export class TestAttemptsController {
  constructor(private readonly attempts: TestAttemptsService) {}

  @Post('tests/:testId/attempts')
  start(@Req() request: AuthenticatedRequest, @Param('testId') testId: string) {
    return this.attempts.start(request.user.id, testId);
  }

  @Get('test-attempts/:attemptId')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
  ) {
    return this.attempts.findOne(request.user.id, attemptId);
  }

  @Put('test-attempts/:attemptId/questions/:testQuestionId/answer')
  saveAnswer(
    @Req() request: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
    @Param('testQuestionId') testQuestionId: string,
    @Body() dto: SaveTestAttemptAnswerDto,
  ) {
    return this.attempts.saveAnswer(
      request.user.id,
      attemptId,
      testQuestionId,
      dto,
    );
  }

  @Post('test-attempts/:attemptId/submit')
  submit(
    @Req() request: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
  ) {
    return this.attempts.submit(request.user.id, attemptId);
  }
}
