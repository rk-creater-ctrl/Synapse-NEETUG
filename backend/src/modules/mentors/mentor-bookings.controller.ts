import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { CreateMentorBookingDto } from './mentors.dto';
import { MentorBookingsService } from './mentor-bookings.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('student mentor bookings')
@ApiBearerAuth()
@Controller('mentor-bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.STUDENT)
export class MentorBookingsController {
  constructor(private readonly bookings: MentorBookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a fixed 15-minute booking with an active mentor' })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateMentorBookingDto) {
    return this.bookings.create(request.user.id, dto);
  }

  @Post(':bookingId/cancel')
  @ApiOperation({ summary: 'Cancel the authenticated student booking' })
  cancel(@Req() request: AuthenticatedRequest, @Param('bookingId') bookingId: string) {
    return this.bookings.cancelForStudent(request.user.id, bookingId);
  }
}
