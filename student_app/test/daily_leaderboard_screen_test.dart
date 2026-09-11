import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_leaderboard_models.dart';
import 'package:synapse_neetug/features/learning/presentation/daily_leaderboard_screen.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  testWidgets('renders ranks, readable time, and the current student', (tester) async {
    await _pump(tester, _LeaderboardApi(leaderboard: _leaderboard()));

    expect(find.text('2026-09-11'), findsOneWidget);
    expect(find.text('#1'), findsOneWidget);
    expect(find.text('Asha'), findsOneWidget);
    expect(find.text('1h 20m · 2 sessions'), findsOneWidget);
    expect(find.text('Me (You)'), findsOneWidget);
  });

  testWidgets('renders a separate current user position, empty state, and error',
      (tester) async {
    await _pump(tester, _LeaderboardApi(leaderboard: _outsideTop()));
    expect(find.text('Your position'), findsOneWidget);
    expect(find.text('#51'), findsOneWidget);
    expect(find.text('Me (You)'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await _pump(tester, _LeaderboardApi(leaderboard: _empty()));
    expect(find.text('No completed study sessions are on today\'s leaderboard yet.'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await _pump(tester, _LeaderboardApi(error: StateError('offline')));
    expect(find.text('Unable to load daily leaderboard. Retry'), findsOneWidget);
  });
}

Future<void> _pump(WidgetTester tester, _LeaderboardApi api) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [learningApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: DailyLeaderboardScreen()),
    ),
  );
  await tester.pump();
  await tester.pump();
}

class _LeaderboardApi extends LearningApiService {
  final DailyStudyLeaderboard? leaderboard;
  final Object? error;

  _LeaderboardApi({this.leaderboard, this.error}) : super(Dio());

  @override
  Future<DailyStudyLeaderboard> dailyStudyLeaderboard() async {
    if (error != null) {
      throw error!;
    }
    return leaderboard!;
  }
}

DailyStudyLeaderboard _leaderboard() => DailyStudyLeaderboard(
      date: '2026-09-11',
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

DailyStudyLeaderboard _outsideTop() => DailyStudyLeaderboard(
      date: '2026-09-11',
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

DailyStudyLeaderboard _empty() => const DailyStudyLeaderboard(
      date: '2026-09-11',
      entries: [],
      currentUser: null,
    );
