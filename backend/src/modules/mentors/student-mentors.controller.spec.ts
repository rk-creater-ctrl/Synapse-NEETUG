import 'reflect-metadata';
import { RoleName } from '@prisma/client';
import { validate } from 'class-validator';

import { StudentMentorListQueryDto } from './mentors.dto';
import { StudentMentorsController } from './student-mentors.controller';

describe('StudentMentorsController', () => {
  it('delegates only discovery filters and mentor profile identifiers', async () => {
    const mentors = {
      discoverForStudents: jest.fn().mockResolvedValue([]),
      getDiscoverableMentor: jest.fn().mockResolvedValue({ id: 'mentor-1' }),
    };
    const controller = new StudentMentorsController(mentors as never);

    await controller.list({ subjectId: 'physics', search: 'asha' });
    await controller.get('mentor-1');

    expect(mentors.discoverForStudents).toHaveBeenCalledWith({ subjectId: 'physics', search: 'asha' });
    expect(mentors.getDiscoverableMentor).toHaveBeenCalledWith('mentor-1');
  });

  it('requires the STUDENT role at the controller level', () => {
    const roles = Reflect.getMetadata('roles', StudentMentorsController) as RoleName[];
    expect(roles).toEqual([RoleName.STUDENT]);
    expect(roles).not.toContain(RoleName.MENTOR);
  });

  it('validates bounded student discovery query fields', async () => {
    const query = new StudentMentorListQueryDto();
    query.subjectId = 'x'.repeat(192);
    await expect(validate(query)).resolves.not.toHaveLength(0);
  });
});
