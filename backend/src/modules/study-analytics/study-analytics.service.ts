import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleName, StudySessionStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  creditStudySessions,
  isCreditableStudySession,
} from '../../shared/study/credited-study-time';
import {
  StudyAnalyticsContextDto,
  StudyAnalyticsDayDto,
  StudyAnalyticsPeriodDto,
  StudyAnalyticsResponseDto,
  StudyAnalyticsSubjectDto,
} from './study-analytics.dto';

type AnalyticsSession = {
  id: string;
  studentId: string;
  status: StudySessionStatus;
  completedAt: Date | null;
  finalDurationSeconds: number | null;
  contextType: string;
  subjectId: string | null;
  subject: { id: string; name: string } | null;
};

type CreditedAnalyticsSession = AnalyticsSession & { creditedSeconds: number };

@Injectable()
export class StudyAnalyticsService {
  constructor(private readonly db: PrismaService) {}

  async summary(studentId: string): Promise<StudyAnalyticsResponseDto> {
    await this.requireActiveStudent(studentId);

    const sessions = await this.db.studySession.findMany({
      where: {
        studentId,
        status: StudySessionStatus.COMPLETED,
        completedAt: { not: null },
        finalDurationSeconds: { gt: 0 },
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        completedAt: true,
        finalDurationSeconds: true,
        contextType: true,
        subjectId: true,
        subject: { select: { id: true, name: true } },
      },
    });
    const validSessions = creditStudySessions(
      sessions.filter(isCreditableStudySession),
    );
    const now = new Date();
    const todayStart = this.utcDayStart(now);
    const tomorrowStart = this.addUtcDays(todayStart, 1);
    const weekStart = this.addUtcDays(todayStart, -((todayStart.getUTCDay() + 6) % 7));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    return {
      today: this.period(validSessions, todayStart, tomorrowStart),
      week: this.period(validSessions, weekStart, tomorrowStart),
      month: this.period(validSessions, monthStart, tomorrowStart),
      allTime: this.aggregate(validSessions),
      bySubject: this.bySubject(validSessions),
      byContextType: this.byContextType(validSessions),
      recentDays: this.recentDays(validSessions, todayStart),
    };
  }

  private period(
    sessions: CreditedAnalyticsSession[],
    start: Date,
    end: Date,
  ): StudyAnalyticsPeriodDto {
    return this.aggregate(
      sessions.filter(
        (session) =>
          session.completedAt !== null &&
          session.completedAt >= start &&
          session.completedAt < end,
      ),
    );
  }

  private aggregate(sessions: CreditedAnalyticsSession[]): StudyAnalyticsPeriodDto {
    const totalSeconds = sessions.reduce(
      (total, session) => total + session.creditedSeconds,
      0,
    );
    return {
      totalSeconds,
      sessionCount: sessions.length,
      averageSessionSeconds:
        sessions.length === 0 ? 0 : Math.floor(totalSeconds / sessions.length),
    };
  }

  private bySubject(sessions: CreditedAnalyticsSession[]): StudyAnalyticsSubjectDto[] {
    const grouped = new Map<string, StudyAnalyticsSubjectDto>();
    for (const session of sessions) {
      if (!session.subjectId || !session.subject) {
        continue;
      }
      const current = grouped.get(session.subjectId) ?? {
        subjectId: session.subject.id,
        subjectName: session.subject.name,
        totalSeconds: 0,
        sessionCount: 0,
      };
      current.totalSeconds += session.creditedSeconds;
      current.sessionCount += 1;
      grouped.set(session.subjectId, current);
    }
    return [...grouped.values()].sort(
      (left, right) =>
        right.totalSeconds - left.totalSeconds ||
        left.subjectName.localeCompare(right.subjectName),
    );
  }

  private byContextType(sessions: CreditedAnalyticsSession[]): StudyAnalyticsContextDto[] {
    const grouped = new Map<string, StudyAnalyticsContextDto>();
    for (const session of sessions) {
      const current = grouped.get(session.contextType) ?? {
        contextType: session.contextType,
        totalSeconds: 0,
        sessionCount: 0,
      };
      current.totalSeconds += session.creditedSeconds;
      current.sessionCount += 1;
      grouped.set(session.contextType, current);
    }
    return [...grouped.values()].sort(
      (left, right) =>
        right.totalSeconds - left.totalSeconds ||
        left.contextType.localeCompare(right.contextType),
    );
  }

  private recentDays(sessions: CreditedAnalyticsSession[], todayStart: Date): StudyAnalyticsDayDto[] {
    return Array.from({ length: 7 }, (_, index) => {
      const start = this.addUtcDays(todayStart, index - 6);
      const end = this.addUtcDays(start, 1);
      return {
        date: start.toISOString().slice(0, 10),
        ...this.period(sessions, start, end),
      };
    });
  }

  private utcDayStart(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addUtcDays(date: Date, days: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
  }

  private async requireActiveStudent(studentId: string) {
    const user = await this.db.user.findUnique({
      where: { id: studentId },
      select: { isActive: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'STUDY_ANALYTICS_STUDENT_NOT_FOUND',
        message: 'Student not found.',
      });
    }
    if (!user.isActive || !user.roles.some(({ role }) => role.name === RoleName.STUDENT)) {
      throw new ForbiddenException({
        code: 'STUDY_ANALYTICS_STUDENT_REQUIRED',
        message: 'Study analytics are available to active students only.',
      });
    }
  }
}
