import { StudySessionStatus } from '@prisma/client';

export const MAX_CREDITED_STUDY_SESSION_SECONDS = 21600;
export const MAX_CREDITED_STUDY_SECONDS_PER_DAY = 57600;

export type StudySessionCreditInput = {
  id: string;
  studentId: string;
  status: StudySessionStatus;
  completedAt: Date | null;
  finalDurationSeconds: number | null;
};

export type CreditedStudySession<T extends StudySessionCreditInput> = T & {
  creditedSeconds: number;
};

export function isCreditableStudySession<T extends StudySessionCreditInput>(
  session: T,
): session is T & {
  completedAt: Date;
  finalDurationSeconds: number;
} {
  return (
    session.status === StudySessionStatus.COMPLETED &&
    session.completedAt !== null &&
    Number.isFinite(session.completedAt.getTime()) &&
    session.finalDurationSeconds !== null &&
    Number.isFinite(session.finalDurationSeconds) &&
    session.finalDurationSeconds > 0
  );
}

/**
 * Credits completed sessions in ascending UTC completion order. Sessions with
 * identical completion timestamps use their stable IDs as the tie-breaker.
 */
export function creditStudySessions<T extends StudySessionCreditInput>(
  sessions: T[],
): CreditedStudySession<T>[] {
  const validSessions = sessions.filter(isCreditableStudySession);
  const creditedById = new Map<string, number>();
  const remainingByStudentUtcDay = new Map<string, number>();

  [...validSessions]
    .sort(
      (left, right) =>
        left.completedAt.getTime() - right.completedAt.getTime() ||
        left.id.localeCompare(right.id),
    )
    .forEach((session) => {
      const utcDay = utcStudyDay(session.completedAt);
      const budgetKey = `${session.studentId}:${utcDay}`;
      const remaining = remainingByStudentUtcDay.get(budgetKey) ??
        MAX_CREDITED_STUDY_SECONDS_PER_DAY;
      const sessionCredit = Math.min(
        session.finalDurationSeconds,
        MAX_CREDITED_STUDY_SESSION_SECONDS,
      );
      const creditedSeconds = Math.min(sessionCredit, remaining);

      creditedById.set(session.id, creditedSeconds);
      remainingByStudentUtcDay.set(budgetKey, remaining - creditedSeconds);
    });

  return validSessions.map((session) => ({
    ...session,
    creditedSeconds: creditedById.get(session.id) ?? 0,
  }));
}

export function utcStudyDay(completedAt: Date): string {
  return completedAt.toISOString().slice(0, 10);
}
