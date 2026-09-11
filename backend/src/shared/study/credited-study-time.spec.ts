import { StudySessionStatus } from '@prisma/client';

import {
  creditStudySessions,
  MAX_CREDITED_STUDY_SECONDS_PER_DAY,
  MAX_CREDITED_STUDY_SESSION_SECONDS,
} from './credited-study-time';

describe('credited study time', () => {
  const session = (
    id: string,
    completedAt: string,
    finalDurationSeconds: number | null,
    status = StudySessionStatus.COMPLETED,
  ) => ({
    id,
    studentId: 'student-1',
    status,
    completedAt: new Date(completedAt),
    finalDurationSeconds,
  });

  it.each([
    [1, 1],
    [MAX_CREDITED_STUDY_SESSION_SECONDS, MAX_CREDITED_STUDY_SESSION_SECONDS],
    [MAX_CREDITED_STUDY_SESSION_SECONDS + 1, MAX_CREDITED_STUDY_SESSION_SECONDS],
    [999999, MAX_CREDITED_STUDY_SESSION_SECONDS],
  ])('caps an individual valid session duration of %i to %i seconds', (duration, expected) => {
    const [credited] = creditStudySessions([
      session('session-1', '2026-09-11T10:00:00.000Z', duration),
    ]);

    expect(credited.creditedSeconds).toBe(expected);
  });

  it.each([0, -1, null])('does not credit invalid duration %p', (duration) => {
    expect(
      creditStudySessions([
        session('session-1', '2026-09-11T10:00:00.000Z', duration),
      ]),
    ).toEqual([]);
  });

  it('preserves daily totals below and at the daily cap, then caps later sessions', () => {
    const credited = creditStudySessions([
      session('first', '2026-09-11T08:00:00.000Z', 20000),
      session('second', '2026-09-11T09:00:00.000Z', 20000),
      session('third', '2026-09-11T10:00:00.000Z', 20000),
    ]);

    expect(credited.map((item) => item.creditedSeconds)).toEqual([
      20000,
      20000,
      MAX_CREDITED_STUDY_SECONDS_PER_DAY - 40000,
    ]);
    expect(credited.reduce((total, item) => total + item.creditedSeconds, 0)).toBe(
      MAX_CREDITED_STUDY_SECONDS_PER_DAY,
    );
  });

  it('leaves daily totals below and exactly at the cap unchanged', () => {
    const belowCap = creditStudySessions([
      session('first', '2026-09-11T08:00:00.000Z', 10000),
      session('second', '2026-09-11T09:00:00.000Z', 20000),
    ]);
    const exactlyAtCap = creditStudySessions([
      session('first', '2026-09-11T08:00:00.000Z', 21600),
      session('second', '2026-09-11T09:00:00.000Z', 21600),
      session('third', '2026-09-11T10:00:00.000Z', 14400),
    ]);

    expect(belowCap.reduce((total, item) => total + item.creditedSeconds, 0)).toBe(30000);
    expect(exactlyAtCap.reduce((total, item) => total + item.creditedSeconds, 0)).toBe(
      MAX_CREDITED_STUDY_SECONDS_PER_DAY,
    );
  });

  it('resets the daily budget at the next UTC day', () => {
    const credited = creditStudySessions([
      session('first', '2026-09-11T23:00:00.000Z', MAX_CREDITED_STUDY_SESSION_SECONDS),
      session('second', '2026-09-12T00:00:00.000Z', MAX_CREDITED_STUDY_SESSION_SECONDS),
    ]);

    expect(credited.map((item) => item.creditedSeconds)).toEqual([
      MAX_CREDITED_STUDY_SESSION_SECONDS,
      MAX_CREDITED_STUDY_SESSION_SECONDS,
    ]);
  });

  it('applies the daily cap independently for each student', () => {
    const credited = creditStudySessions([
      session('first-student-one', '2026-09-11T08:00:00.000Z', 21600),
      session('second-student-one', '2026-09-11T09:00:00.000Z', 21600),
      session('third-student-one', '2026-09-11T10:00:00.000Z', 21600),
      {
        ...session('first-student-two', '2026-09-11T08:30:00.000Z', 21600),
        studentId: 'student-2',
      },
    ]);

    expect(credited.map((item) => item.creditedSeconds)).toEqual([
      21600,
      21600,
      14400,
      21600,
    ]);
  });

  it('allocates same-day credit by completion time and stable ID fallback', () => {
    const credited = creditStudySessions([
      session('z-last', '2026-09-11T10:00:00.000Z', 21600),
      session('b-second', '2026-09-11T09:00:00.000Z', 21600),
      session('a-first', '2026-09-11T09:00:00.000Z', 21600),
    ]);

    expect(credited.map((item) => [item.id, item.creditedSeconds])).toEqual([
      ['z-last', 14400],
      ['b-second', 21600],
      ['a-first', 21600],
    ]);
  });
});
