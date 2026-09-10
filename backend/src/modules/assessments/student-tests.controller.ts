import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { StudentTestListQueryDto } from './student-tests.dto';
import { StudentTestsService } from './student-tests.service';

@Controller('learning/tests')
@UseGuards(JwtAuthGuard)
export class StudentTestsController {
  constructor(private readonly tests: StudentTestsService) {}

  @Get()
  list(@Query() query: StudentTestListQueryDto) {
    return this.tests.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tests.findOne(id);
  }
}
