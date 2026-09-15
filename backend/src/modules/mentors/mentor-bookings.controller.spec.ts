import { RoleName } from '@prisma/client';

import { MentorBookingsController } from './mentor-bookings.controller';

describe('MentorBookingsController', () => {
  it('uses only the authenticated student identity when creating a booking', async () => {
    const bookings = { create: jest.fn().mockResolvedValue({ id: 'booking-1' }), listForStudent: jest.fn(), getForStudent: jest.fn() };
    const controller = new MentorBookingsController(bookings as never, { forStudent: jest.fn() } as never);
    const dto = { mentorId: 'mentor-1', scheduledStartAt: '2026-09-14T03:30:00.000Z' };

    await expect(controller.create({ user: { id: 'student-1' } }, dto)).resolves.toEqual({ id: 'booking-1' });
    expect(bookings.create).toHaveBeenCalledWith('student-1', dto);
  });

  it('uses only the authenticated student identity when cancelling', async () => {
    const bookings = { create: jest.fn(), cancelForStudent: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'CANCELLED' }) };
    const controller = new MentorBookingsController(bookings as never, { forStudent: jest.fn() } as never);
    await expect(controller.cancel({ user: { id: 'student-1' } }, 'booking-1')).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(bookings.cancelForStudent).toHaveBeenCalledWith('student-1', 'booking-1');
  });

  it('uses only the authenticated student identity for session list and detail reads', async () => {
    const bookings = { create: jest.fn(), cancelForStudent: jest.fn(), listForStudent: jest.fn().mockResolvedValue([]), getForStudent: jest.fn().mockResolvedValue({ id: 'booking-1' }) };
    const controller = new MentorBookingsController(bookings as never, { forStudent: jest.fn() } as never);
    await controller.list({ user: { id: 'student-1' } }, { scope: 'past' });
    await controller.get({ user: { id: 'student-1' } }, 'booking-1');
    expect(bookings.listForStudent).toHaveBeenCalledWith('student-1', 'past');
    expect(bookings.getForStudent).toHaveBeenCalledWith('student-1', 'booking-1');
  });

  it('forwards only authenticated student identity for video access', async () => {
    const videoAccess = { forStudent: jest.fn().mockResolvedValue({ bookingId: 'booking-1' }) };
    const controller = new MentorBookingsController({} as never, videoAccess as never);
    await controller.videoAccess({ user: { id: 'student-1' } }, 'booking-1');
    expect(videoAccess.forStudent).toHaveBeenCalledWith('student-1', 'booking-1');
  });

  it('requires the STUDENT role at the controller level', () => {
    expect(Reflect.getMetadata('roles', MentorBookingsController)).toEqual([RoleName.STUDENT]);
  });
});
