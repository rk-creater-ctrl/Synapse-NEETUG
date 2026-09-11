Map<String, dynamic> _analyticsMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

int _analyticsInt(Object? value) => value is num ? value.toInt() : 0;

class StudyAnalyticsPeriod {
  final int totalSeconds;
  final int sessionCount;
  final int averageSessionSeconds;

  const StudyAnalyticsPeriod({
    required this.totalSeconds,
    required this.sessionCount,
    required this.averageSessionSeconds,
  });

  factory StudyAnalyticsPeriod.fromJson(Map<String, dynamic> json) =>
      StudyAnalyticsPeriod(
        totalSeconds: _analyticsInt(json['totalSeconds']),
        sessionCount: _analyticsInt(json['sessionCount']),
        averageSessionSeconds: _analyticsInt(json['averageSessionSeconds']),
      );
}

class StudyAnalyticsSubject {
  final String subjectId;
  final String subjectName;
  final int totalSeconds;
  final int sessionCount;

  const StudyAnalyticsSubject({
    required this.subjectId,
    required this.subjectName,
    required this.totalSeconds,
    required this.sessionCount,
  });

  factory StudyAnalyticsSubject.fromJson(Map<String, dynamic> json) =>
      StudyAnalyticsSubject(
        subjectId: json['subjectId']?.toString() ?? '',
        subjectName: json['subjectName']?.toString() ?? '',
        totalSeconds: _analyticsInt(json['totalSeconds']),
        sessionCount: _analyticsInt(json['sessionCount']),
      );
}

class StudyAnalyticsContext {
  final String contextType;
  final int totalSeconds;
  final int sessionCount;

  const StudyAnalyticsContext({
    required this.contextType,
    required this.totalSeconds,
    required this.sessionCount,
  });

  factory StudyAnalyticsContext.fromJson(Map<String, dynamic> json) =>
      StudyAnalyticsContext(
        contextType: json['contextType']?.toString() ?? 'GENERAL',
        totalSeconds: _analyticsInt(json['totalSeconds']),
        sessionCount: _analyticsInt(json['sessionCount']),
      );
}

class StudyAnalyticsDay {
  final String date;
  final int totalSeconds;
  final int sessionCount;

  const StudyAnalyticsDay({
    required this.date,
    required this.totalSeconds,
    required this.sessionCount,
  });

  factory StudyAnalyticsDay.fromJson(Map<String, dynamic> json) =>
      StudyAnalyticsDay(
        date: json['date']?.toString() ?? '',
        totalSeconds: _analyticsInt(json['totalSeconds']),
        sessionCount: _analyticsInt(json['sessionCount']),
      );
}

class StudyAnalytics {
  final StudyAnalyticsPeriod today;
  final StudyAnalyticsPeriod week;
  final StudyAnalyticsPeriod month;
  final StudyAnalyticsPeriod allTime;
  final List<StudyAnalyticsSubject> bySubject;
  final List<StudyAnalyticsContext> byContextType;
  final List<StudyAnalyticsDay> recentDays;

  const StudyAnalytics({
    required this.today,
    required this.week,
    required this.month,
    required this.allTime,
    required this.bySubject,
    required this.byContextType,
    required this.recentDays,
  });

  factory StudyAnalytics.fromJson(Map<String, dynamic> json) => StudyAnalytics(
        today: StudyAnalyticsPeriod.fromJson(_analyticsMap(json['today'])),
        week: StudyAnalyticsPeriod.fromJson(_analyticsMap(json['week'])),
        month: StudyAnalyticsPeriod.fromJson(_analyticsMap(json['month'])),
        allTime: StudyAnalyticsPeriod.fromJson(_analyticsMap(json['allTime'])),
        bySubject: (json['bySubject'] as List? ?? const [])
            .map((item) => StudyAnalyticsSubject.fromJson(_analyticsMap(item)))
            .toList(),
        byContextType: (json['byContextType'] as List? ?? const [])
            .map((item) => StudyAnalyticsContext.fromJson(_analyticsMap(item)))
            .toList(),
        recentDays: (json['recentDays'] as List? ?? const [])
            .map((item) => StudyAnalyticsDay.fromJson(_analyticsMap(item)))
            .toList(),
      );
}
