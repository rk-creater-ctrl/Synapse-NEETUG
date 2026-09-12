import { RoleName } from '@prisma/client';

import { MentorSelfController } from './mentor-self.controller';

describe('MentorSelfController', () => {
  it('uses only the authenticated mentor identity for the self profile', async () => {
    const mentors = {
      getOwnProfile: jest.fn().mockResolvedValue({ id: 'mentor-1' }),
      getOwnAvailability: jest.fn().mockResolvedValue({ slots: [] }),
      replaceOwnAvailability: jest.fn().mockResolvedValue({ slots: [] }),
    };
    const controller = new MentorSelfController(mentors as never);

    await expect(controller.getOwnProfile({ user: { id: 'mentor-user' } })).resolves.toEqual({
      id: 'mentor-1',
    });
    expect(mentors.getOwnProfile).toHaveBeenCalledWith('mentor-user');

    await controller.getOwnAvailability({ user: { id: 'mentor-user' } });
    await controller.replaceOwnAvailability({ user: { id: 'mentor-user' } }, {
      timezone: 'UTC', slots: [],
    });
    expect(mentors.getOwnAvailability).toHaveBeenCalledWith('mentor-user');
    expect(mentors.replaceOwnAvailability).toHaveBeenCalledWith('mentor-user', {
      timezone: 'UTC', slots: [],
    });
  });

  it('requires the MENTOR role at the controller level', () => {
    const roles = Reflect.getMetadata('roles', MentorSelfController) as RoleName[];
    expect(roles).toEqual([RoleName.MENTOR]);
  });
});
