import { MentorVideoSessionStatus } from '@prisma/client';

import { MentorVideoSessionLifecycleService } from './mentor-video-session-lifecycle.service';

describe('MentorVideoSessionLifecycleService', () => {
  const now = new Date('2026-09-16T10:00:00.000Z');
  let db: { mentorVideoSession: { updateMany: jest.Mock; findUnique: jest.Mock } };
  let service: MentorVideoSessionLifecycleService;

  beforeEach(() => {
    db = {
      mentorVideoSession: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    service = new MentorVideoSessionLifecycleService(db as never);
  });

  it('atomically activates a READY session and sets its start timestamp once', async () => {
    db.mentorVideoSession.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.activate('video-1', now);

    expect(db.mentorVideoSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'video-1', status: MentorVideoSessionStatus.READY, startedAt: null },
      data: { status: MentorVideoSessionStatus.ACTIVE, startedAt: now },
    });
  });

  it('keeps an already ACTIVE session and its original start time unchanged on reconnect', async () => {
    db.mentorVideoSession.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    db.mentorVideoSession.findUnique.mockResolvedValue({ status: MentorVideoSessionStatus.ACTIVE });

    await expect(service.activate('video-1', now)).resolves.toBeUndefined();

    expect(db.mentorVideoSession.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'video-1', status: MentorVideoSessionStatus.READY, startedAt: null },
      data: { status: MentorVideoSessionStatus.ACTIVE, startedAt: now },
    });
  });

  it('does not reactivate an ENDED session', async () => {
    db.mentorVideoSession.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    db.mentorVideoSession.findUnique.mockResolvedValue({ status: MentorVideoSessionStatus.ENDED });

    await expect(service.activate('video-1', now)).rejects.toMatchObject({
      response: { code: 'VIDEO_CALL_ENDED' },
    });
  });

  it.each([MentorVideoSessionStatus.READY, MentorVideoSessionStatus.ACTIVE])('ends %s once without changing booking state', async (status) => {
    db.mentorVideoSession.updateMany.mockResolvedValue({ count: 1 });

    await service.end('video-1', now);

    expect(db.mentorVideoSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'video-1', status: { in: [MentorVideoSessionStatus.READY, MentorVideoSessionStatus.ACTIVE] } },
      data: { status: MentorVideoSessionStatus.ENDED, endedAt: now },
    });
  });

  it('treats an already ENDED session as an idempotent end operation', async () => {
    db.mentorVideoSession.updateMany.mockResolvedValue({ count: 0 });
    db.mentorVideoSession.findUnique.mockResolvedValue({ status: MentorVideoSessionStatus.ENDED });

    await expect(service.end('video-1', new Date('2026-09-16T10:05:00.000Z'))).resolves.toBeUndefined();
  });
});
