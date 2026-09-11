export interface DailyLeaderboardEntryDto {
  rank: number;
  studentId: string;
  displayName: string;
  totalSeconds: number;
  sessionCount: number;
  isCurrentUser: boolean;
}

export interface DailyStudyLeaderboardResponseDto {
  date: string;
  entries: DailyLeaderboardEntryDto[];
  currentUser: DailyLeaderboardEntryDto | null;
}

export interface WeeklyStudyLeaderboardResponseDto {
  weekStart: string;
  weekEnd: string;
  entries: DailyLeaderboardEntryDto[];
  currentUser: DailyLeaderboardEntryDto | null;
}

export interface MonthlyStudyLeaderboardResponseDto {
  monthStart: string;
  monthEnd: string;
  entries: DailyLeaderboardEntryDto[];
  currentUser: DailyLeaderboardEntryDto | null;
}
