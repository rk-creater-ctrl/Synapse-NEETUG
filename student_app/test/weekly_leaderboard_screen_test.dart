import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_leaderboard_models.dart';
import 'package:synapse_neetug/features/learning/presentation/weekly_leaderboard_screen.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  testWidgets('renders weekly range, ranks, readable duration, and current user',
      (tester) async {
    await _pump(tester, _WeeklyApi(leaderboard: _leaderboard()));

    expect(find.text('Weekly Leaderboard'), findsOneWidget);
    expect(find.text('2026-09-07 – 2026-09-13'), findsOneWidget);
    expect(find.text('#1'), findsOneWidget);
    expect(find.text('Asha'), findsOneWidget);
    expect(find.text('1h 20m · 2 sessions'), findsOneWidget);
    expect(find.text('Me (You)'), findsOneWidget);
  });

  testWidgets('renders outside-top position, empty state, and retry error',
      (tester) async {
    await _pump(tester, _WeeklyApi(leaderboard: _outsideTop()));
    expect(find.text('Your position'), findsOneWidget);
    expect(find.text('#51'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await _pump(tester, _WeeklyApi(leaderboard: _empty()));
    expect(find.text('No completed study sessions are on this week\'s leaderboard yet.'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await _pump(tester, _WeeklyApi(error: StateError('offline')));
    expect(find.text('Unable to load weekly leaderboard. Retry'), findsOneWidget);
  });
}

Future<void> _pump(WidgetTester tester, _WeeklyApi api) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [learningApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: WeeklyLeaderboardScreen()),
    ),
  );
  await tester.pump();
  await tester.pump();
}

class _WeeklyApi extends LearningApiService {
  final WeeklyStudyLeaderboard? leaderboard;
  final Object? error;

  _WeeklyApi({this.leaderboard, this.error}) : super(Dio());

  @override
  Future<WeeklyStudyLeaderboard> weeklyStudyLeaderboard() async {
    if (error != null) {
      throw error!;
    }
    return leaderboard!;
  }
}

WeeklyStudyLeaderboard _leaderboard() => WeeklyStudyLeaderboard(
      weekStart: '2026-09-07',
      weekEnd: '2026-09-13',
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

WeeklyStudyLeaderboard _outsideTop() => WeeklyStudyLeaderboard(
      weekStart: '2026-09-07',
      weekEnd: '2026-09-13',
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

WeeklyStudyLeaderboard _empty() => const WeeklyStudyLeaderboard(
      weekStart: '2026-09-07',
      weekEnd: '2026-09-13',
      entries: [],
      currentUser: null,
    );
