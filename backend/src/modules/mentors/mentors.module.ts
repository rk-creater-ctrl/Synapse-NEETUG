import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MentorSelfController } from './mentor-self.controller';
import { MentorsController } from './mentors.controller';
import { StudentMentorsController } from './student-mentors.controller';
import { MentorBookingsController } from './mentor-bookings.controller';
import { MentorBookingLifecycleController } from './mentor-booking-lifecycle.controller';
import { MentorBookingsService } from './mentor-bookings.service';
import { MentorsService } from './mentors.service';
import { BookingVideoAccessService } from './booking-video-access.service';

@Module({
  controllers: [MentorsController, MentorSelfController, StudentMentorsController, MentorBookingsController, MentorBookingLifecycleController],
  providers: [MentorsService, MentorBookingsService, BookingVideoAccessService, PrismaService, RolesGuard],
  exports: [BookingVideoAccessService],
})
export class MentorsModule {}
