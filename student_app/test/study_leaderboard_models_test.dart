import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/study_leaderboard_models.dart';

void main() {
  test('parses leaderboard entries and a current user position', () {
    final leaderboard = DailyStudyLeaderboard.fromJson(_json());

    expect(leaderboard.date, '2026-09-11');
    expect(leaderboard.entries.first.rank, 1);
    expect(leaderboard.entries.first.totalSeconds, 4800);
    expect(leaderboard.currentUser?.displayName, 'Me');
    expect(leaderboard.currentUser?.isCurrentUser, isTrue);
  });

  test('parses an empty leaderboard with an unranked current user', () {
    final leaderboard = DailyStudyLeaderboard.fromJson({
      'date': '2026-09-11',
      'entries': [],
      'currentUser': null,
    });

    expect(leaderboard.entries, isEmpty);
    expect(leaderboard.currentUser, isNull);
  });

  test('parses a weekly wrapper while reusing daily leaderboard entries', () {
    final leaderboard = WeeklyStudyLeaderboard.fromJson({
      'weekStart': '2026-09-07',
      'weekEnd': '2026-09-13',
      'entries': _json()['entries'],
      'currentUser': null,
    });

    expect(leaderboard.weekStart, '2026-09-07');
    expect(leaderboard.weekEnd, '2026-09-13');
    expect(leaderboard.entries.single.displayName, 'Asha');
    expect(leaderboard.currentUser, isNull);
  });

  test('parses a monthly wrapper while reusing leaderboard entries', () {
    final leaderboard = MonthlyStudyLeaderboard.fromJson({
      'monthStart': '2026-09-01',
      'monthEnd': '2026-09-30',
      'entries': _json()['entries'],
      'currentUser': null,
    });

    expect(leaderboard.monthStart, '2026-09-01');
    expect(leaderboard.monthEnd, '2026-09-30');
    expect(leaderboard.entries.single.displayName, 'Asha');
    expect(leaderboard.currentUser, isNull);
  });
}

Map<String, dynamic> _json() => {
      'date': '2026-09-11',
      'entries': [
        {
          'rank': 1,
          'studentId': 'student-1',
          'displayName': 'Asha',
          'totalSeconds': 4800,
          'sessionCount': 2,
          'isCurrentUser': false,
        },
      ],
      'currentUser': {
        'rank': 51,
        'studentId': 'student-me',
        'displayName': 'Me',
        'totalSeconds': 1200,
        'sessionCount': 1,
        'isCurrentUser': true,
      },
    };
