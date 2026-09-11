import { StudyAnalyticsController } from './study-analytics.controller';

describe('StudyAnalyticsController', () => {
  it('forwards only the authenticated request user id', async () => {
    const summary = jest.fn().mockResolvedValue({ allTime: { totalSeconds: 0 } });
    const controller = new StudyAnalyticsController({ summary } as never);

    await expect(controller.summary({ user: { id: 'student-1' } }))
      .resolves.toEqual({ allTime: { totalSeconds: 0 } });
    expect(summary).toHaveBeenCalledWith('student-1');
  });
});
