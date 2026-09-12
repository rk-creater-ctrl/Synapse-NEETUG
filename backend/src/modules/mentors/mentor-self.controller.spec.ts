import { RoleName } from '@prisma/client';

import { MentorSelfController } from './mentor-self.controller';

describe('MentorSelfController', () => {
  it('uses only the authenticated mentor identity for the self profile', async () => {
    const mentors = { getOwnProfile: jest.fn().mockResolvedValue({ id: 'mentor-1' }) };
    const controller = new MentorSelfController(mentors as never);

    await expect(controller.getOwnProfile({ user: { id: 'mentor-user' } })).resolves.toEqual({
      id: 'mentor-1',
    });
    expect(mentors.getOwnProfile).toHaveBeenCalledWith('mentor-user');
  });

  it('requires the MENTOR role at the controller level', () => {
    const roles = Reflect.getMetadata('roles', MentorSelfController) as RoleName[];
    expect(roles).toEqual([RoleName.MENTOR]);
  });
});
