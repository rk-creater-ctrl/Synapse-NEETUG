import { RoleName } from '@prisma/client';

import { MentorsController } from './mentors.controller';

describe('MentorsController', () => {
  it('delegates only mentor-management inputs to the service', async () => {
    const mentors = {
      create: jest.fn().mockResolvedValue({ id: 'mentor-1' }),
      list: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id: 'mentor-1' }),
      update: jest.fn().mockResolvedValue({ id: 'mentor-1' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'mentor-1', isActive: false }),
      replaceSubjects: jest.fn().mockResolvedValue({ id: 'mentor-1' }),
    };
    const controller = new MentorsController(mentors as never);

    await controller.create({ userId: 'user-mentor', fullName: 'Asha', subjectIds: ['physics'] });
    await controller.list({ page: 1, limit: 20 });
    await controller.get('mentor-1');
    await controller.update('mentor-1', { headline: 'Physics mentor' });
    await controller.updateStatus('mentor-1', { isActive: false });
    await controller.replaceSubjects('mentor-1', { subjectIds: ['physics'] });

    expect(mentors.create).toHaveBeenCalledWith({
      userId: 'user-mentor', fullName: 'Asha', subjectIds: ['physics'],
    });
    expect(mentors.updateStatus).toHaveBeenCalledWith('mentor-1', false);
    expect(mentors.replaceSubjects).toHaveBeenCalledWith('mentor-1', { subjectIds: ['physics'] });
  });

  it('requires ADMIN or SUPER_ADMIN at the controller level', () => {
    const roles = Reflect.getMetadata('roles', MentorsController) as RoleName[];
    expect(roles).toEqual([RoleName.ADMIN, RoleName.SUPER_ADMIN]);
    expect(roles).not.toContain(RoleName.MENTOR);
  });
});
