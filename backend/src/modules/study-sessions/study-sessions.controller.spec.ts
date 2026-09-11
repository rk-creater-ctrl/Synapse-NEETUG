import { StudySessionStatus } from '@prisma/client';

import { StudySessionsController } from './study-sessions.controller';

describe('StudySessionsController', () => {
  const sessions = {
    start: jest.fn(),
    current: jest.fn(),
    get: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    complete: jest.fn(),
    abandon: jest.fn(),
  };
  const controller = new StudySessionsController(sessions as never);
  const request = { user: { id: 'student-1' } };

  beforeEach(() => jest.clearAllMocks());

  it('derives ownership from request.user for create and lifecycle calls', () => {
    const dto = { contextType: 'GENERAL' } as never;
    controller.start(request, dto);
    controller.pause(request, 'session-1');
    controller.complete(request, 'session-1');

    expect(sessions.start).toHaveBeenCalledWith('student-1', dto);
    expect(sessions.pause).toHaveBeenCalledWith('student-1', 'session-1');
    expect(sessions.complete).toHaveBeenCalledWith('student-1', 'session-1');
  });

  it('forwards only the route session identifier for reads and lifecycle operations', () => {
    controller.current(request);
    controller.get(request, 'session-1');
    controller.resume(request, 'session-1');
    controller.abandon(request, 'session-1');

    expect(sessions.current).toHaveBeenCalledWith('student-1');
    expect(sessions.get).toHaveBeenCalledWith('student-1', 'session-1');
    expect(sessions.resume).toHaveBeenCalledWith('student-1', 'session-1');
    expect(sessions.abandon).toHaveBeenCalledWith('student-1', 'session-1');
    expect(StudySessionStatus.IN_PROGRESS).toBe('IN_PROGRESS');
  });
});
