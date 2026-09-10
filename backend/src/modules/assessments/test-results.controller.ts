import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { TestResultsService } from './test-results.service';

type AuthenticatedRequest = {
  user: {
    id: string;
  };
};

@Controller('learning/test-attempts')
@UseGuards(JwtAuthGuard)
export class TestResultsController {
  constructor(private readonly results: TestResultsService) {}

  @Get(':attemptId/result')
  result(
    @Req() request: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
  ) {
    return this.results.result(request.user.id, attemptId);
  }

  @Get(':attemptId/review')
  review(
    @Req() request: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
  ) {
    return this.results.review(request.user.id, attemptId);
  }
}
