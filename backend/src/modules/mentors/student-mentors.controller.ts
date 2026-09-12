import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { StudentMentorListQueryDto } from './mentors.dto';
import { MentorsService } from './mentors.service';

@ApiTags('student mentors')
@ApiBearerAuth()
@Controller('mentors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.STUDENT)
export class StudentMentorsController {
  constructor(private readonly mentors: MentorsService) {}

  @Get()
  @ApiOperation({ summary: 'Discover active mentors for authenticated students' })
  list(@Query() query: StudentMentorListQueryDto) {
    return this.mentors.discoverForStudents(query);
  }

  @Get(':mentorId')
  @ApiOperation({ summary: 'Get an active mentor and recurring weekly availability' })
  get(@Param('mentorId') mentorId: string) {
    return this.mentors.getDiscoverableMentor(mentorId);
  }
}
