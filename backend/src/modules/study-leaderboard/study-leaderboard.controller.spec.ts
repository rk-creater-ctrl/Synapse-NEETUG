import { StudyLeaderboardController } from './study-leaderboard.controller';

describe('StudyLeaderboardController', () => {
  it('uses only the authenticated request user id', async () => {
    const daily = jest.fn().mockResolvedValue({ date: '2026-09-11', entries: [] });
    const weekly = jest.fn().mockResolvedValue({ weekStart: '2026-09-07', entries: [] });
    const monthly = jest.fn().mockResolvedValue({ monthStart: '2026-09-01', entries: [] });
    const controller = new StudyLeaderboardController({ daily, weekly, monthly } as never);

    await expect(controller.daily({ user: { id: 'student-1' } }))
      .resolves.toEqual({ date: '2026-09-11', entries: [] });
    expect(daily).toHaveBeenCalledWith('student-1');

    await expect(controller.weekly({ user: { id: 'student-1' } }))
      .resolves.toEqual({ weekStart: '2026-09-07', entries: [] });
    expect(weekly).toHaveBeenCalledWith('student-1');

    await expect(controller.monthly({ user: { id: 'student-1' } }))
      .resolves.toEqual({ monthStart: '2026-09-01', entries: [] });
    expect(monthly).toHaveBeenCalledWith('student-1');
  });
});
