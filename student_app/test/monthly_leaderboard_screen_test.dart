import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_leaderboard_models.dart';
import 'package:synapse_neetug/features/learning/presentation/monthly_leaderboard_screen.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  testWidgets('renders monthly range, ranks, readable duration, and current user',
      (tester) async {
    await _pump(tester, _MonthlyApi(leaderboard: _leaderboard()));

    expect(find.text('Monthly Leaderboard'), findsOneWidget);
    expect(find.textContaining('2026-09-01'), findsOneWidget);
    expect(find.textContaining('2026-09-30'), findsOneWidget);
    expect(find.text('#1'), findsOneWidget);
    expect(find.text('Asha'), findsOneWidget);
    expect(find.textContaining('1h 20m'), findsOneWidget);
    expect(find.textContaining('2 sessions'), findsOneWidget);
    expect(find.text('Me (You)'), findsOneWidget);
  });

  testWidgets('renders outside-top position, empty state, and retry error',
      (tester) async {
    await _pump(tester, _MonthlyApi(leaderboard: _outsideTop()));
    expect(find.text('Your position'), findsOneWidget);
    expect(find.text('#51'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await _pump(tester, _MonthlyApi(leaderboard: _empty()));
    expect(
      find.text('No completed study sessions are on this month\'s leaderboard yet.'),
      findsOneWidget,
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await _pump(tester, _MonthlyApi(error: StateError('offline')));
    expect(find.text('Unable to load monthly leaderboard. Retry'), findsOneWidget);
  });
}

Future<void> _pump(WidgetTester tester, _MonthlyApi api) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [learningApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: MonthlyLeaderboardScreen()),
    ),
  );
  await tester.pump();
  await tester.pump();
}

class _MonthlyApi extends LearningApiService {
  final MonthlyStudyLeaderboard? leaderboard;
  final Object? error;

  _MonthlyApi({this.leaderboard, this.error}) : super(Dio());

  @override
  Future<MonthlyStudyLeaderboard> monthlyStudyLeaderboard() async {
    if (error != null) {
      throw error!;
    }
    return leaderboard!;
  }
}

MonthlyStudyLeaderboard _leaderboard() => MonthlyStudyLeaderboard(
      monthStart: '2026-09-01',
      monthEnd: '2026-09-30',
      entries: const [
        DailyLeaderboardEntry(
          rank: 1,
          studentId: 'student-1',
          displayName: 'Asha',
          totalSeconds: 4800,
          sessionCount: 2,
          isCurrentUser: false,
        ),
        DailyLeaderboardEntry(
          rank: 2,
          studentId: 'student-me',
          displayName: 'Me',
          totalSeconds: 2700,
          sessionCount: 1,
          isCurrentUser: true,
        ),
      ],
      currentUser: const DailyLeaderboardEntry(
        rank: 2,
        studentId: 'student-me',
        displayName: 'Me',
        totalSeconds: 2700,
        sessionCount: 1,
        isCurrentUser: true,
      ),
    );

MonthlyStudyLeaderboard _outsideTop() => MonthlyStudyLeaderboard(
      monthStart: '2026-09-01',
      monthEnd: '2026-09-30',
      entries: const [
        DailyLeaderboardEntry(
          rank: 1,
          studentId: 'student-1',
          displayName: 'Asha',
          totalSeconds: 4800,
          sessionCount: 2,
          isCurrentUser: false,
        ),
      ],
      currentUser: const DailyLeaderboardEntry(
        rank: 51,
        studentId: 'student-me',
        displayName: 'Me',
        totalSeconds: 1200,
        sessionCount: 1,
        isCurrentUser: true,
      ),
    );

MonthlyStudyLeaderboard _empty() => const MonthlyStudyLeaderboard(
      monthStart: '2026-09-01',
      monthEnd: '2026-09-30',
      entries: [],
      currentUser: null,
    );
