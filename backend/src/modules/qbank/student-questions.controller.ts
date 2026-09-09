import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { StudentQuestionListDto } from './student-questions.dto';
import { StudentQuestionsService } from './student-questions.service';

@ApiTags('student questions')
@ApiBearerAuth()
@Controller('learning/questions')
@UseGuards(JwtAuthGuard)
export class StudentQuestionsController {
  constructor(private readonly questions: StudentQuestionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse student-visible free questions without answer keys or explanations',
  })
  list(@Query() query: StudentQuestionListDto) {
    return this.questions.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a student-visible free question without answer keys or explanations',
  })
  get(@Param('id') id: string) {
    return this.questions.get(id);
  }
}
