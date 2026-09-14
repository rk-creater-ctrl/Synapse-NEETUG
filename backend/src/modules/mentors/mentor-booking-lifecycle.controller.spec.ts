import { RoleName } from '@prisma/client';
import { validate } from 'class-validator';

import { MentorBookingLifecycleController } from './mentor-booking-lifecycle.controller';
import { MentorBookingListQueryDto } from './mentors.dto';

describe('MentorBookingLifecycleController', () => {
  it('derives every lifecycle actor from the authenticated mentor', async () => {
    const bookings = {
      listForMentor: jest.fn().mockResolvedValue([]),
      confirmForMentor: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
      cancelForMentor: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
      completeForMentor: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
    };
    const controller = new MentorBookingLifecycleController(bookings as never);
    const request = { user: { id: 'mentor-user' } };
    await controller.list(request, { scope: 'upcoming' });
    await controller.confirm(request, 'booking-1');
    await controller.cancel(request, 'booking-1');
    await controller.complete(request, 'booking-1');
    expect(bookings.listForMentor).toHaveBeenCalledWith('mentor-user', 'upcoming');
    expect(bookings.confirmForMentor).toHaveBeenCalledWith('mentor-user', 'booking-1');
    expect(bookings.cancelForMentor).toHaveBeenCalledWith('mentor-user', 'booking-1');
    expect(bookings.completeForMentor).toHaveBeenCalledWith('mentor-user', 'booking-1');
  });

  it('requires the MENTOR role at the controller level', () => {
    expect(Reflect.getMetadata('roles', MentorBookingLifecycleController)).toEqual([RoleName.MENTOR]);
  });

  it('rejects unsupported booking scopes through DTO validation', async () => {
    const query = new MentorBookingListQueryDto();
    query.scope = 'invalid' as never;
    await expect(validate(query)).resolves.not.toHaveLength(0);
  });
});
