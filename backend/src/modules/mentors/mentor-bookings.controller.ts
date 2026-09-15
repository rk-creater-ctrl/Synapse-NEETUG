import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { CreateMentorBookingDto, MentorBookingListQueryDto } from './mentors.dto';
import { MentorBookingsService } from './mentor-bookings.service';
import { BookingVideoAccessService } from './booking-video-access.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('student mentor bookings')
@ApiBearerAuth()
@Controller('mentor-bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.STUDENT)
export class MentorBookingsController {
  constructor(
    private readonly bookings: MentorBookingsService,
    private readonly bookingVideoAccess: BookingVideoAccessService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a fixed 15-minute booking with an active mentor' })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateMentorBookingDto) {
    return this.bookings.create(request.user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List authenticated student mentor bookings' })
  list(@Req() request: AuthenticatedRequest, @Query() query: MentorBookingListQueryDto) {
    return this.bookings.listForStudent(request.user.id, query.scope);
  }

  @Get(':bookingId')
  @ApiOperation({ summary: 'Get an authenticated student-owned mentor booking' })
  get(@Req() request: AuthenticatedRequest, @Param('bookingId') bookingId: string) {
    return this.bookings.getForStudent(request.user.id, bookingId);
  }

  @Post(':bookingId/cancel')
  @ApiOperation({ summary: 'Cancel the authenticated student booking' })
  cancel(@Req() request: AuthenticatedRequest, @Param('bookingId') bookingId: string) {
    return this.bookings.cancelForStudent(request.user.id, bookingId);
  }

  @Post(':bookingId/video-access')
  @ApiOperation({ summary: 'Get temporary video access for an owned confirmed booking' })
  videoAccess(@Req() request: AuthenticatedRequest, @Param('bookingId') bookingId: string) {
    return this.bookingVideoAccess.forStudent(request.user.id, bookingId);
  }
}
