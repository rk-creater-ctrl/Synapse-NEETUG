import { RoleName } from '@prisma/client';

import { MentorBookingsController } from './mentor-bookings.controller';

describe('MentorBookingsController', () => {
  it('uses only the authenticated student identity when creating a booking', async () => {
    const bookings = { create: jest.fn().mockResolvedValue({ id: 'booking-1' }) };
    const controller = new MentorBookingsController(bookings as never);
    const dto = { mentorId: 'mentor-1', scheduledStartAt: '2026-09-14T03:30:00.000Z' };

    await expect(controller.create({ user: { id: 'student-1' } }, dto)).resolves.toEqual({ id: 'booking-1' });
    expect(bookings.create).toHaveBeenCalledWith('student-1', dto);
  });

  it('requires the STUDENT role at the controller level', () => {
    expect(Reflect.getMetadata('roles', MentorBookingsController)).toEqual([RoleName.STUDENT]);
  });
});
