import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MentorBookableSlotsQueryDto, StudentMentorListQueryDto } from './mentors.dto';
import { MentorBookingsService } from './mentor-bookings.service';
import { MentorsService } from './mentors.service';

@ApiTags('student mentors')
@ApiBearerAuth()
@Controller('mentors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.STUDENT)
export class StudentMentorsController {
  constructor(
    private readonly mentors: MentorsService,
    private readonly bookings: MentorBookingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Discover active mentors for authenticated students' })
  list(@Query() query: StudentMentorListQueryDto) {
    return this.mentors.discoverForStudents(query);
  }

  @Get(':mentorId/bookable-slots')
  @ApiOperation({ summary: 'Get future 15-minute bookable slots for an active mentor' })
  bookableSlots(
    @Param('mentorId') mentorId: string,
    @Query() query: MentorBookableSlotsQueryDto,
  ) {
    return this.bookings.bookableSlots(mentorId, query.date);
  }

  @Get(':mentorId')
  @ApiOperation({ summary: 'Get an active mentor and recurring weekly availability' })
  get(@Param('mentorId') mentorId: string) {
    return this.mentors.getDiscoverableMentor(mentorId);
  }
}
