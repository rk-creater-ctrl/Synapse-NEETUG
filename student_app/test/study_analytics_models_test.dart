import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/study_analytics_models.dart';

void main() {
  test('parses periods, subject and context breakdowns, and recent days', () {
    final analytics = StudyAnalytics.fromJson(_analyticsJson());

    expect(analytics.today.totalSeconds, 600);
    expect(analytics.week.sessionCount, 3);
    expect(analytics.bySubject.single.subjectName, 'Physics');
    expect(analytics.byContextType.single.contextType, 'QUESTION_PRACTICE');
    expect(analytics.recentDays.single.date, '2026-09-11');
  });

  test('uses safe zero defaults for an empty analytics response', () {
    final analytics = StudyAnalytics.fromJson(const {});

    expect(analytics.allTime.totalSeconds, 0);
    expect(analytics.bySubject, isEmpty);
    expect(analytics.byContextType, isEmpty);
    expect(analytics.recentDays, isEmpty);
  });
}

Map<String, dynamic> _analyticsJson() => {
      'today': _period(600, 1),
      'week': _period(1200, 3),
      'month': _period(1800, 4),
      'allTime': _period(2400, 5),
      'bySubject': [
        {'subjectId': 'physics', 'subjectName': 'Physics', 'totalSeconds': 1200, 'sessionCount': 2},
      ],
      'byContextType': [
        {'contextType': 'QUESTION_PRACTICE', 'totalSeconds': 1200, 'sessionCount': 2},
      ],
      'recentDays': [
        {'date': '2026-09-11', 'totalSeconds': 600, 'sessionCount': 1},
      ],
    };

Map<String, dynamic> _period(int seconds, int count) => {
      'totalSeconds': seconds,
      'sessionCount': count,
      'averageSessionSeconds': count == 0 ? 0 : seconds ~/ count,
    };
