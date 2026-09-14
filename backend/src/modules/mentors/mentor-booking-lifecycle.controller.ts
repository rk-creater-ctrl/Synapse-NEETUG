import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MentorBookingsService } from './mentor-bookings.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('mentor bookings')
@ApiBearerAuth()
@Controller('mentors/me/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.MENTOR)
export class MentorBookingLifecycleController {
  constructor(private readonly bookings: MentorBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'List bookings owned by the authenticated mentor' })
  list(@Req() request: AuthenticatedRequest) {
    return this.bookings.listForMentor(request.user.id);
  }

  @Post(':bookingId/confirm')
  @ApiOperation({ summary: 'Confirm an owned pending mentor booking' })
  confirm(@Req() request: AuthenticatedRequest, @Param('bookingId') bookingId: string) {
    return this.bookings.confirmForMentor(request.user.id, bookingId);
  }

  @Post(':bookingId/cancel')
  @ApiOperation({ summary: 'Cancel an owned pending or confirmed mentor booking' })
  cancel(@Req() request: AuthenticatedRequest, @Param('bookingId') bookingId: string) {
    return this.bookings.cancelForMentor(request.user.id, bookingId);
  }

  @Post(':bookingId/complete')
  @ApiOperation({ summary: 'Complete an owned confirmed booking after its scheduled end' })
  complete(@Req() request: AuthenticatedRequest, @Param('bookingId') bookingId: string) {
    return this.bookings.completeForMentor(request.user.id, bookingId);
  }
}
