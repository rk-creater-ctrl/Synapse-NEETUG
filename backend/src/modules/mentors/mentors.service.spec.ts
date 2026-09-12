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
    timezone: 'UTC',
    createdAt: new Date('2026-09-12T10:00:00.000Z'),
    updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    expertise: [{ subject: { id: 'physics', name: 'Physics' } }],
    ...overrides,
  });
  const availability = (overrides: Record<string, unknown> = {}) => ({
    id: 'mentor-1',
    timezone: 'Asia/Kolkata',
    availability: [
      {
        id: 'slot-2', dayOfWeek: 1, startMinute: 840, endMinute: 1020,
        createdAt: new Date('2026-09-13T10:00:00.000Z'), updatedAt: new Date('2026-09-13T10:00:00.000Z'),
      },
      {
        id: 'slot-1', dayOfWeek: 1, startMinute: 540, endMinute: 720,
        createdAt: new Date('2026-09-13T10:00:00.000Z'), updatedAt: new Date('2026-09-13T10:00:00.000Z'),
      },
    ],
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

  it('returns the safe profile for its authenticated mentor owner, including inactive profiles', async () => {
    profile.findUnique.mockResolvedValueOnce(mentor());
    const result = await service.getOwnProfile('user-mentor');
    expect(result).toMatchObject({
      id: 'mentor-1',
      userId: 'user-mentor',
      fullName: 'Dr Asha',
      subjects: [{ id: 'physics', name: 'Physics' }],
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('roles');
    expect(profile.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-mentor' },
    }));

    profile.findUnique.mockResolvedValueOnce(mentor({ isActive: false }));
    await expect(service.getOwnProfile('user-mentor')).resolves.toMatchObject({ isActive: false });

    profile.findUnique.mockResolvedValueOnce(null);
    await expect(service.getOwnProfile('user-mentor')).rejects.toBeInstanceOf(NotFoundException);
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

  it('gets own availability safely, including an empty schedule, in deterministic order', async () => {
    profile.findUnique.mockResolvedValueOnce(availability());
    await expect(service.getOwnAvailability('user-mentor')).resolves.toEqual(expect.objectContaining({
      mentorProfileId: 'mentor-1',
      timezone: 'Asia/Kolkata',
      slots: [
        expect.objectContaining({ id: 'slot-1', dayOfWeek: 1, startMinute: 540 }),
        expect.objectContaining({ id: 'slot-2', dayOfWeek: 1, startMinute: 840 }),
      ],
    }));

    profile.findUnique.mockResolvedValueOnce(availability({ availability: [] }));
    await expect(service.getOwnAvailability('user-mentor')).resolves.toMatchObject({ slots: [] });

    profile.findUnique.mockResolvedValueOnce(null);
    await expect(service.getOwnAvailability('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replaces, clears, and updates recurring availability atomically', async () => {
    profile.findUnique.mockResolvedValueOnce({ id: 'mentor-1' });
    profile.update.mockResolvedValueOnce(availability());
    const result = await service.replaceOwnAvailability('user-mentor', {
      timezone: 'Asia/Kolkata',
      slots: [
        { dayOfWeek: 1, startMinute: 840, endMinute: 1020 },
        { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
      ],
    });
    expect(result.timezone).toBe('Asia/Kolkata');
    expect(profile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'mentor-1' },
      data: expect.objectContaining({
        timezone: 'Asia/Kolkata',
        availability: {
          deleteMany: {},
          create: [
            { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
            { dayOfWeek: 1, startMinute: 840, endMinute: 1020 },
          ],
        },
      }),
    }));

    profile.findUnique.mockResolvedValueOnce({ id: 'mentor-1' });
    profile.update.mockResolvedValueOnce(availability({ timezone: 'UTC', availability: [] }));
    await expect(service.replaceOwnAvailability('user-mentor', {
      timezone: 'UTC', slots: [],
    })).resolves.toMatchObject({ timezone: 'UTC', slots: [] });
  });

  it('rejects invalid availability before any destructive write', async () => {
    const invalidCases = [
      { timezone: 'Not/A_Timezone', slots: [] },
      { timezone: 'UTC', slots: [{ dayOfWeek: 7, startMinute: 0, endMinute: 1 }] },
      { timezone: 'UTC', slots: [{ dayOfWeek: 1, startMinute: -1, endMinute: 1 }] },
      { timezone: 'UTC', slots: [{ dayOfWeek: 1, startMinute: 60, endMinute: 60 }] },
      {
        timezone: 'UTC',
        slots: [
          { dayOfWeek: 1, startMinute: 60, endMinute: 120 },
          { dayOfWeek: 1, startMinute: 60, endMinute: 120 },
        ],
      },
      {
        timezone: 'UTC',
        slots: [
          { dayOfWeek: 1, startMinute: 60, endMinute: 180 },
          { dayOfWeek: 1, startMinute: 120, endMinute: 240 },
        ],
      },
    ];

    for (const input of invalidCases) {
      await expect(service.replaceOwnAvailability('user-mentor', input)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(profile.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('accepts adjacent and different-day availability slots', async () => {
    profile.findUnique.mockResolvedValueOnce({ id: 'mentor-1' });
    profile.update.mockResolvedValueOnce(availability({ timezone: 'UTC', availability: [] }));
    await expect(service.replaceOwnAvailability('user-mentor', {
      timezone: 'UTC',
      slots: [
        { dayOfWeek: 1, startMinute: 60, endMinute: 120 },
        { dayOfWeek: 1, startMinute: 120, endMinute: 180 },
        { dayOfWeek: 2, startMinute: 60, endMinute: 120 },
      ],
    })).resolves.toMatchObject({ timezone: 'UTC' });
  });
});
