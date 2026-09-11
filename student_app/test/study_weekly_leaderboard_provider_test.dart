import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_leaderboard_models.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  test('loads and refreshes the weekly leaderboard', () async {
    final api = _WeeklyLeaderboardApi(leaderboard: _leaderboard('2026-09-07'));
    final container = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    expect((await container.read(weeklyStudyLeaderboardProvider.future)).weekStart, '2026-09-07');
    container.invalidate(weeklyStudyLeaderboardProvider);
    api.leaderboard = _leaderboard('2026-09-14');
    expect((await container.read(weeklyStudyLeaderboardProvider.future)).weekStart, '2026-09-14');
    expect(api.calls, 2);
  });

  test('exposes weekly leaderboard empty and error results', () async {
    final emptyApi = _WeeklyLeaderboardApi(leaderboard: _leaderboard('2026-09-07'));
    final emptyContainer = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(emptyApi)],
    );
    addTearDown(emptyContainer.dispose);
    expect((await emptyContainer.read(weeklyStudyLeaderboardProvider.future)).entries, isEmpty);

    final errorApi = _WeeklyLeaderboardApi(error: StateError('offline'));
    final errorContainer = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(errorApi)],
    );
    addTearDown(errorContainer.dispose);
    await expectLater(
      errorContainer.read(weeklyStudyLeaderboardProvider.future),
      throwsA(isA<StateError>()),
    );
  });
}

class _WeeklyLeaderboardApi extends LearningApiService {
  WeeklyStudyLeaderboard? leaderboard;
  Object? error;
  int calls = 0;

  _WeeklyLeaderboardApi({this.leaderboard, this.error}) : super(Dio());

  @override
  Future<WeeklyStudyLeaderboard> weeklyStudyLeaderboard() async {
    calls += 1;
    if (error != null) {
      throw error!;
    }
    return leaderboard!;
  }
}

WeeklyStudyLeaderboard _leaderboard(String start) => WeeklyStudyLeaderboard(
      weekStart: start,
      weekEnd: '2026-09-13',
      entries: const [],
      currentUser: null,
    );
