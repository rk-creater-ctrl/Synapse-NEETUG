export interface StudyAnalyticsPeriodDto {
  totalSeconds: number;
  sessionCount: number;
  averageSessionSeconds: number;
}

export interface StudyAnalyticsSubjectDto {
  subjectId: string;
  subjectName: string;
  totalSeconds: number;
  sessionCount: number;
}

export interface StudyAnalyticsContextDto {
  contextType: string;
  totalSeconds: number;
  sessionCount: number;
}

export interface StudyAnalyticsDayDto {
  date: string;
  totalSeconds: number;
  sessionCount: number;
}

export interface StudyAnalyticsResponseDto {
  today: StudyAnalyticsPeriodDto;
  week: StudyAnalyticsPeriodDto;
  month: StudyAnalyticsPeriodDto;
  allTime: StudyAnalyticsPeriodDto;
  bySubject: StudyAnalyticsSubjectDto[];
  byContextType: StudyAnalyticsContextDto[];
  recentDays: StudyAnalyticsDayDto[];
}
