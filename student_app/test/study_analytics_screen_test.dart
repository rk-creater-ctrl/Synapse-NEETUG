import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_analytics_models.dart';
import 'package:synapse_neetug/features/learning/presentation/study_analytics_screen.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  testWidgets('renders personal totals, recent history, and breakdowns', (tester) async {
    await _pump(tester, _ScreenAnalyticsApi(analytics: _analytics()));

    expect(find.text('Today'), findsOneWidget);
    expect(find.text('10m'), findsOneWidget);
    expect(find.text('This week'), findsOneWidget);
    expect(find.text('1h 0m'), findsWidgets);
    expect(find.text('Last 7 days'), findsOneWidget);

    final fixtureDay = find.text('2026-09-11');
    await tester.scrollUntilVisible(fixtureDay, 300);
    expect(fixtureDay, findsOneWidget);
    final dayRow = find.ancestor(of: fixtureDay, matching: find.byType(ListTile));
    expect(dayRow, findsOneWidget);
    expect(find.descendant(of: dayRow, matching: find.textContaining('10m')), findsOneWidget);

    final physics = find.text('Physics');
    await tester.scrollUntilVisible(physics, 300);
    expect(physics, findsOneWidget);

    final questionPractice = find.text('QUESTION PRACTICE');
    await tester.scrollUntilVisible(questionPractice, 300);
    expect(questionPractice, findsOneWidget);
  });

  testWidgets('renders a clean empty state and retry error state', (tester) async {
    await _pump(tester, _ScreenAnalyticsApi(analytics: _empty()));
    expect(find.text('No completed study sessions yet.'), findsOneWidget);
    expect(find.text('No subject-specific completed study time yet.'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await _pump(tester, _ScreenAnalyticsApi(error: StateError('offline')));
    expect(find.text('Unable to load study analytics. Retry'), findsOneWidget);
  });
}

Future<void> _pump(WidgetTester tester, _ScreenAnalyticsApi api) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [learningApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: StudyAnalyticsScreen()),
    ),
  );
  await tester.pump();
  await tester.pump();
}

class _ScreenAnalyticsApi extends LearningApiService {
  final StudyAnalytics? analytics;
  final Object? error;

  _ScreenAnalyticsApi({this.analytics, this.error}) : super(Dio());

  @override
  Future<StudyAnalytics> studyAnalytics() async {
    if (error != null) {
      throw error!;
    }
    return analytics!;
  }
}

StudyAnalytics _analytics() => StudyAnalytics(
      today: _period(600, 1),
      week: _period(3600, 3),
      month: _period(7200, 4),
      allTime: _period(10800, 5),
      bySubject: const [
        StudyAnalyticsSubject(
          subjectId: 'physics',
          subjectName: 'Physics',
          totalSeconds: 3600,
          sessionCount: 3,
        ),
      ],
      byContextType: const [
        StudyAnalyticsContext(
          contextType: 'QUESTION_PRACTICE',
          totalSeconds: 3600,
          sessionCount: 3,
        ),
      ],
      recentDays: const [
        StudyAnalyticsDay(date: '2026-09-05', totalSeconds: 0, sessionCount: 0),
        StudyAnalyticsDay(date: '2026-09-06', totalSeconds: 0, sessionCount: 0),
        StudyAnalyticsDay(date: '2026-09-07', totalSeconds: 0, sessionCount: 0),
        StudyAnalyticsDay(date: '2026-09-08', totalSeconds: 0, sessionCount: 0),
        StudyAnalyticsDay(date: '2026-09-09', totalSeconds: 0, sessionCount: 0),
        StudyAnalyticsDay(date: '2026-09-10', totalSeconds: 0, sessionCount: 0),
        StudyAnalyticsDay(date: '2026-09-11', totalSeconds: 600, sessionCount: 1),
      ],
    );

StudyAnalytics _empty() => StudyAnalytics(
      today: _period(0, 0),
      week: _period(0, 0),
      month: _period(0, 0),
      allTime: _period(0, 0),
      bySubject: const [],
      byContextType: const [],
      recentDays: const [],
    );

StudyAnalyticsPeriod _period(int seconds, int sessions) => StudyAnalyticsPeriod(
      totalSeconds: seconds,
      sessionCount: sessions,
      averageSessionSeconds: sessions == 0 ? 0 : seconds ~/ sessions,
    );
