import { DailyStudyController } from './daily-study.controller';

describe('DailyStudyController', () => {
  it('delegates using only the authenticated student identity and date query', async () => {
    const getOrGenerateDailyModule = jest.fn().mockResolvedValue({ id: 'module-1' });
    const controller = new DailyStudyController({
      getOrGenerateDailyModule,
    } as never);

    await expect(
      controller.get(
        { user: { id: 'student-from-jwt' } },
        { date: '2026-09-10' },
      ),
    ).resolves.toEqual({ id: 'module-1' });

    expect(getOrGenerateDailyModule).toHaveBeenCalledWith(
      'student-from-jwt',
      '2026-09-10',
    );
    expect(getOrGenerateDailyModule).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ studentId: expect.anything() }),
    );
  });

  it('propagates service errors through normal Nest handling', async () => {
    const failure = new Error('service failure');
    const controller = new DailyStudyController({
      getOrGenerateDailyModule: jest.fn().mockRejectedValue(failure),
    } as never);

    await expect(
      controller.get({ user: { id: 'student-1' } }, { date: '2026-09-10' }),
    ).rejects.toBe(failure);
  });

  it('forwards an authenticated task-status mutation without accepting a student ID', async () => {
    const updateTaskStatus = jest.fn().mockResolvedValue({ id: 'module-1' });
    const controller = new DailyStudyController({
      updateTaskStatus,
    } as never);

    await expect(
      controller.updateTaskStatus(
        { user: { id: 'student-from-jwt' } },
        'task-1',
        { status: 'COMPLETED' } as never,
      ),
    ).resolves.toEqual({ id: 'module-1' });

    expect(updateTaskStatus).toHaveBeenCalledWith(
      'student-from-jwt',
      'task-1',
      'COMPLETED',
    );
  });
});
