import {
  localDateWeekday,
  parseMentorLocalDate,
  resolveMentorLocalMinute,
} from './mentor-booking-time';

describe('mentor booking time helpers', () => {
  it('parses strict local calendar dates and keeps their weekly day stable', () => {
    const date = parseMentorLocalDate('2026-09-14');
    expect(date).toEqual({ year: 2026, month: 9, day: 14 });
    expect(localDateWeekday(date!)).toBe(1);
    expect(parseMentorLocalDate('2026-02-30')).toBeNull();
  });

  it('resolves a mentor-local time to UTC using the mentor timezone', () => {
    const instant = resolveMentorLocalMinute({ year: 2026, month: 9, day: 14 }, 9 * 60, 'Asia/Kolkata');
    expect(instant?.toISOString()).toBe('2026-09-14T03:30:00.000Z');
  });
});
