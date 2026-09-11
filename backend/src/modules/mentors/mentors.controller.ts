import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import {
  CreateMentorDto,
  MentorListQueryDto,
  ReplaceMentorSubjectsDto,
  UpdateMentorDto,
  UpdateMentorStatusDto,
} from './mentors.dto';
import { MentorsService } from './mentors.service';

@ApiTags('admin mentors')
@ApiBearerAuth()
@Controller('admin/mentors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
export class MentorsController {
  constructor(private readonly mentors: MentorsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a mentor profile for an existing MENTOR user' })
  create(@Body() dto: CreateMentorDto) {
    return this.mentors.create(dto);
  }

  @Get()
  list(@Query() query: MentorListQueryDto) {
    return this.mentors.list(query);
  }

  @Get(':mentorId')
  get(@Param('mentorId') mentorId: string) {
    return this.mentors.get(mentorId);
  }

  @Patch(':mentorId')
  update(@Param('mentorId') mentorId: string, @Body() dto: UpdateMentorDto) {
    return this.mentors.update(mentorId, dto);
  }

  @Patch(':mentorId/status')
  updateStatus(
    @Param('mentorId') mentorId: string,
    @Body() dto: UpdateMentorStatusDto,
  ) {
    return this.mentors.updateStatus(mentorId, dto.isActive);
  }

  @Put(':mentorId/subjects')
  replaceSubjects(
    @Param('mentorId') mentorId: string,
    @Body() dto: ReplaceMentorSubjectsDto,
  ) {
    return this.mentors.replaceSubjects(mentorId, dto);
  }
}
