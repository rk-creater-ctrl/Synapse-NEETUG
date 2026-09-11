Map<String, dynamic> _leaderboardMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

int _leaderboardInt(Object? value) => value is num ? value.toInt() : 0;

class DailyLeaderboardEntry {
  final int rank;
  final String studentId;
  final String displayName;
  final int totalSeconds;
  final int sessionCount;
  final bool isCurrentUser;

  const DailyLeaderboardEntry({
    required this.rank,
    required this.studentId,
    required this.displayName,
    required this.totalSeconds,
    required this.sessionCount,
    required this.isCurrentUser,
  });

  factory DailyLeaderboardEntry.fromJson(Map<String, dynamic> json) =>
      DailyLeaderboardEntry(
        rank: _leaderboardInt(json['rank']),
        studentId: json['studentId']?.toString() ?? '',
        displayName: json['displayName']?.toString() ?? 'Student',
        totalSeconds: _leaderboardInt(json['totalSeconds']),
        sessionCount: _leaderboardInt(json['sessionCount']),
        isCurrentUser: json['isCurrentUser'] == true,
      );
}

class DailyStudyLeaderboard {
  final String date;
  final List<DailyLeaderboardEntry> entries;
  final DailyLeaderboardEntry? currentUser;

  const DailyStudyLeaderboard({
    required this.date,
    required this.entries,
    required this.currentUser,
  });

  factory DailyStudyLeaderboard.fromJson(Map<String, dynamic> json) {
    final current = _leaderboardMap(json['currentUser']);
    return DailyStudyLeaderboard(
      date: json['date']?.toString() ?? '',
      entries: (json['entries'] as List? ?? const [])
          .map((item) => DailyLeaderboardEntry.fromJson(_leaderboardMap(item)))
          .toList(),
      currentUser:
          current.isEmpty ? null : DailyLeaderboardEntry.fromJson(current),
    );
  }
}

class WeeklyStudyLeaderboard {
  final String weekStart;
  final String weekEnd;
  final List<DailyLeaderboardEntry> entries;
  final DailyLeaderboardEntry? currentUser;

  const WeeklyStudyLeaderboard({
    required this.weekStart,
    required this.weekEnd,
    required this.entries,
    required this.currentUser,
  });

  factory WeeklyStudyLeaderboard.fromJson(Map<String, dynamic> json) {
    final current = _leaderboardMap(json['currentUser']);
    return WeeklyStudyLeaderboard(
      weekStart: json['weekStart']?.toString() ?? '',
      weekEnd: json['weekEnd']?.toString() ?? '',
      entries: (json['entries'] as List? ?? const [])
          .map((item) => DailyLeaderboardEntry.fromJson(_leaderboardMap(item)))
          .toList(),
      currentUser:
          current.isEmpty ? null : DailyLeaderboardEntry.fromJson(current),
    );
  }
}

class MonthlyStudyLeaderboard {
  final String monthStart;
  final String monthEnd;
  final List<DailyLeaderboardEntry> entries;
  final DailyLeaderboardEntry? currentUser;

  const MonthlyStudyLeaderboard({
    required this.monthStart,
    required this.monthEnd,
    required this.entries,
    required this.currentUser,
  });

  factory MonthlyStudyLeaderboard.fromJson(Map<String, dynamic> json) {
    final current = _leaderboardMap(json['currentUser']);
    return MonthlyStudyLeaderboard(
      monthStart: json['monthStart']?.toString() ?? '',
      monthEnd: json['monthEnd']?.toString() ?? '',
      entries: (json['entries'] as List? ?? const [])
          .map((item) => DailyLeaderboardEntry.fromJson(_leaderboardMap(item)))
          .toList(),
      currentUser:
          current.isEmpty ? null : DailyLeaderboardEntry.fromJson(current),
    );
  }
}
