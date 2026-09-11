import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';

import { MentorsService } from './mentors.service';

describe('MentorsService', () => {
  const mentorUser = {
    id: 'user-mentor',
    roles: [{ role: { name: RoleName.MENTOR } }],
  };
  const mentor = (overrides: Record<string, unknown> = {}) => ({
    id: 'mentor-1',
    userId: 'user-mentor',
    fullName: 'Dr Asha',
    headline: 'Physics mentor',
    bio: 'Experienced educator',
    profileImageUrl: null,
    experienceYears: 8,
    isActive: true,
    createdAt: new Date('2026-09-12T10:00:00.000Z'),
    updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    expertise: [{ subject: { id: 'physics', name: 'Physics' } }],
    ...overrides,
  });
  let db: Record<string, unknown>;
  let profile: Record<string, jest.Mock>;
  let service: MentorsService;

  beforeEach(() => {
    profile = {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    db = {
      user: { findUnique: jest.fn().mockResolvedValue(mentorUser) },
      subject: { findMany: jest.fn().mockResolvedValue([{ id: 'physics' }]) },
      mentorProfile: profile,
      $transaction: jest.fn((work: unknown) => {
        if (typeof work === 'function') {
          return work({ mentorProfile: profile });
        }
        return Promise.all(work as Promise<unknown>[]);
      }),
    };
    service = new MentorsService(db as never);
  });

  it('creates a profile for a MENTOR user with deduplicated subject expertise', async () => {
    profile.findUnique.mockResolvedValueOnce(null);
    profile.create.mockResolvedValueOnce(mentor());

    const result = await service.create({
      userId: 'user-mentor',
      fullName: ' Dr Asha ',
      experienceYears: 8,
      subjectIds: ['physics', 'physics'],
    });

    expect(result).toMatchObject({
      id: 'mentor-1',
      userId: 'user-mentor',
      fullName: 'Dr Asha',
      subjects: [{ id: 'physics', name: 'Physics' }],
    });
    expect(profile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-mentor',
        expertise: { create: [{ subjectId: 'physics' }] },
      }),
    }));
  });

  it('rejects missing, non-MENTOR, duplicate, invalid-subject, and negative-experience creation', async () => {
    (db.user as { findUnique: jest.Mock }).findUnique.mockResolvedValueOnce(null);
    await expect(service.create({ userId: 'missing', fullName: 'Asha', subjectIds: ['physics'] }))
      .rejects.toBeInstanceOf(NotFoundException);

    (db.user as { findUnique: jest.Mock }).findUnique.mockResolvedValueOnce({
      id: 'user-student', roles: [{ role: { name: RoleName.STUDENT } }],
    });
    await expect(service.create({ userId: 'user-student', fullName: 'Asha', subjectIds: ['physics'] }))
      .rejects.toBeInstanceOf(BadRequestException);

    profile.findUnique.mockResolvedValueOnce({ id: 'mentor-1' });
    await expect(service.create({ userId: 'user-mentor', fullName: 'Asha', subjectIds: ['physics'] }))
      .rejects.toBeInstanceOf(ConflictException);

    profile.findUnique.mockResolvedValueOnce(null);
    (db.subject as { findMany: jest.Mock }).findMany.mockResolvedValueOnce([]);
    await expect(service.create({ userId: 'user-mentor', fullName: 'Asha', subjectIds: ['unknown'] }))
      .rejects.toBeInstanceOf(BadRequestException);

    await expect(service.create({
      userId: 'user-mentor', fullName: 'Asha', subjectIds: ['physics'], experienceYears: -1,
    })).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.create({ userId: 'user-mentor', fullName: ' ', subjectIds: ['physics'] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns safe mentor detail and rejects a missing mentor', async () => {
    profile.findUnique.mockResolvedValueOnce(mentor());
    const result = await service.get('mentor-1');
    expect(result).toMatchObject({ id: 'mentor-1', subjects: [{ id: 'physics', name: 'Physics' }] });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('roles');

    profile.findUnique.mockResolvedValueOnce(null);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists profiles using active, subject, and full-name filters', async () => {
    profile.findMany.mockResolvedValueOnce([mentor()]);
    profile.count.mockResolvedValueOnce(1);

    const result = await service.list({
      page: 1, limit: 20, isActive: true, subjectId: 'physics', search: 'asha',
    });

    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(profile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isActive: true,
        expertise: { some: { subjectId: 'physics' } },
        fullName: { contains: 'asha', mode: 'insensitive' },
      }),
    }));
  });

  it('updates allowed fields without changing ownership or expertise', async () => {
    profile.findUnique.mockResolvedValueOnce(mentor());
    profile.update.mockResolvedValueOnce(mentor({ fullName: 'Dr Updated', experienceYears: 10 }));

    const result = await service.update('mentor-1', {
      fullName: 'Dr Updated', experienceYears: 10,
    });

    expect(result.fullName).toBe('Dr Updated');
    expect(profile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { fullName: 'Dr Updated', experienceYears: 10 },
    }));
    await expect(service.update('mentor-1', { experienceYears: -1 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('activates and deactivates mentor profiles without deleting them', async () => {
    profile.findUnique.mockResolvedValueOnce(mentor());
    profile.update.mockResolvedValueOnce(mentor({ isActive: false }));
    await expect(service.updateStatus('mentor-1', false)).resolves.toMatchObject({ isActive: false });

    profile.findUnique.mockResolvedValueOnce(mentor({ isActive: false }));
    profile.update.mockResolvedValueOnce(mentor({ isActive: true }));
    await expect(service.updateStatus('mentor-1', true)).resolves.toMatchObject({ isActive: true });
  });

  it('replaces normalized expertise atomically after validating all subjects', async () => {
    profile.findUnique.mockResolvedValueOnce(mentor());
    (db.subject as { findMany: jest.Mock }).findMany.mockResolvedValueOnce([
      { id: 'physics' }, { id: 'chemistry' },
    ]);
    profile.update.mockResolvedValueOnce(mentor({
      expertise: [
        { subject: { id: 'chemistry', name: 'Chemistry' } },
        { subject: { id: 'physics', name: 'Physics' } },
      ],
    }));

    const result = await service.replaceSubjects('mentor-1', {
      subjectIds: ['chemistry', 'physics', 'chemistry'],
    });
    expect(result.subjects).toEqual([
      { id: 'chemistry', name: 'Chemistry' },
      { id: 'physics', name: 'Physics' },
    ]);
    expect(profile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        expertise: {
          deleteMany: {},
          create: [{ subjectId: 'chemistry' }, { subjectId: 'physics' }],
        },
      },
    }));

    profile.findUnique.mockResolvedValueOnce(mentor());
    (db.subject as { findMany: jest.Mock }).findMany.mockResolvedValueOnce([]);
    await expect(service.replaceSubjects('mentor-1', { subjectIds: ['missing'] }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(profile.update).toHaveBeenCalledTimes(1);
  });
});
