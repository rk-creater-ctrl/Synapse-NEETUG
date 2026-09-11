import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleName, StudySessionStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  creditStudySessions,
  isCreditableStudySession,
} from '../../shared/study/credited-study-time';
import {
  DailyLeaderboardEntryDto,
  DailyStudyLeaderboardResponseDto,
  MonthlyStudyLeaderboardResponseDto,
  WeeklyStudyLeaderboardResponseDto,
} from './study-leaderboard.dto';

type LeaderboardSession = {
  id: string;
  studentId: string;
  status: StudySessionStatus;
  completedAt: Date | null;
  finalDurationSeconds: number | null;
  student: {
    id: string;
    isActive: boolean;
    roles: { role: { name: RoleName } }[];
    studentProfile: { fullName: string } | null;
  };
};

type CreditedLeaderboardSession = LeaderboardSession & { creditedSeconds: number };

@Injectable()
export class StudyLeaderboardService {
  private static readonly topLimit = 50;

  constructor(private readonly db: PrismaService) {}

  async daily(studentId: string): Promise<DailyStudyLeaderboardResponseDto> {
    const now = new Date();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const nextDayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    const ranked = await this.rankedEntries(studentId, dayStart, nextDayStart);

    return {
      date: dayStart.toISOString().slice(0, 10),
      entries: ranked.entries,
      currentUser: ranked.currentUser,
    };
  }

  async weekly(studentId: string): Promise<WeeklyStudyLeaderboardResponseDto> {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const weekStart = this.addUtcDays(
      todayStart,
      -((todayStart.getUTCDay() + 6) % 7),
    );
    const nextWeekStart = this.addUtcDays(weekStart, 7);
    const ranked = await this.rankedEntries(studentId, weekStart, nextWeekStart);

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: this.addUtcDays(weekStart, 6).toISOString().slice(0, 10),
      entries: ranked.entries,
      currentUser: ranked.currentUser,
    };
  }

  async monthly(studentId: string): Promise<MonthlyStudyLeaderboardResponseDto> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const ranked = await this.rankedEntries(studentId, monthStart, nextMonthStart);

    return {
      monthStart: monthStart.toISOString().slice(0, 10),
      monthEnd: this.addUtcDays(nextMonthStart, -1).toISOString().slice(0, 10),
      entries: ranked.entries,
      currentUser: ranked.currentUser,
    };
  }

  private async rankedEntries(studentId: string, start: Date, end: Date) {
    await this.requireActiveStudent(studentId);
    const sessions = await this.db.studySession.findMany({
      where: {
        status: StudySessionStatus.COMPLETED,
        completedAt: { gte: start, lt: end },
        finalDurationSeconds: { gt: 0 },
        student: {
          is: {
            isActive: true,
            roles: { some: { role: { is: { name: RoleName.STUDENT } } } },
          },
        },
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        completedAt: true,
        finalDurationSeconds: true,
        student: {
          select: {
            id: true,
            isActive: true,
            roles: { select: { role: { select: { name: true } } } },
            studentProfile: { select: { fullName: true } },
          },
        },
      },
    });
    const entries = this.rank(
      creditStudySessions(
        sessions.filter(
        (session) =>
          isCreditableStudySession(session) &&
          session.completedAt !== null &&
          session.completedAt >= start &&
          session.completedAt < end &&
          session.student.isActive &&
          session.student.roles.some(({ role }) => role.name === RoleName.STUDENT),
        ),
      ),
      studentId,
    );
    const currentUser = entries.find((entry) => entry.studentId === studentId) ?? null;

    return {
      entries: entries.slice(0, StudyLeaderboardService.topLimit),
      currentUser,
    };
  }

  private rank(
    sessions: CreditedLeaderboardSession[],
    currentStudentId: string,
  ): DailyLeaderboardEntryDto[] {
    const grouped = new Map<string, DailyLeaderboardEntryDto>();
    for (const session of sessions) {
      const current = grouped.get(session.studentId) ?? {
        rank: 0,
        studentId: session.student.id,
        displayName: session.student.studentProfile?.fullName || 'Student',
        totalSeconds: 0,
        sessionCount: 0,
        isCurrentUser: session.studentId === currentStudentId,
      };
      current.totalSeconds += session.creditedSeconds;
      current.sessionCount += 1;
      grouped.set(session.studentId, current);
    }
    return [...grouped.values()]
      .sort(
        (left, right) =>
          right.totalSeconds - left.totalSeconds ||
          right.sessionCount - left.sessionCount ||
          left.studentId.localeCompare(right.studentId),
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  private addUtcDays(date: Date, days: number): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
    );
  }

  private async requireActiveStudent(studentId: string) {
    const user = await this.db.user.findUnique({
      where: { id: studentId },
      select: { isActive: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'STUDY_LEADERBOARD_STUDENT_NOT_FOUND',
        message: 'Student not found.',
      });
    }
    if (!user.isActive || !user.roles.some(({ role }) => role.name === RoleName.STUDENT)) {
      throw new ForbiddenException({
        code: 'STUDY_LEADERBOARD_STUDENT_REQUIRED',
        message: 'Study leaderboard is available to active students only.',
      });
    }
  }
}
