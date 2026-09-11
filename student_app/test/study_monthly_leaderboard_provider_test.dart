import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_leaderboard_models.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  test('loads and refreshes the monthly leaderboard', () async {
    final api = _MonthlyLeaderboardApi(leaderboard: _leaderboard('2026-09-01'));
    final container = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    expect(
      (await container.read(monthlyStudyLeaderboardProvider.future)).monthStart,
      '2026-09-01',
    );
    container.invalidate(monthlyStudyLeaderboardProvider);
    api.leaderboard = _leaderboard('2026-10-01');
    expect(
      (await container.read(monthlyStudyLeaderboardProvider.future)).monthStart,
      '2026-10-01',
    );
    expect(api.calls, 2);
  });

  test('exposes monthly leaderboard empty and error results', () async {
    final emptyApi = _MonthlyLeaderboardApi(leaderboard: _leaderboard('2026-09-01'));
    final emptyContainer = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(emptyApi)],
    );
    addTearDown(emptyContainer.dispose);
    expect(
      (await emptyContainer.read(monthlyStudyLeaderboardProvider.future)).entries,
      isEmpty,
    );

    final errorApi = _MonthlyLeaderboardApi(error: StateError('offline'));
    final errorContainer = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(errorApi)],
    );
    addTearDown(errorContainer.dispose);
    await expectLater(
      errorContainer.read(monthlyStudyLeaderboardProvider.future),
      throwsA(isA<StateError>()),
    );
  });
}

class _MonthlyLeaderboardApi extends LearningApiService {
  MonthlyStudyLeaderboard? leaderboard;
  Object? error;
  int calls = 0;

  _MonthlyLeaderboardApi({this.leaderboard, this.error}) : super(Dio());

  @override
  Future<MonthlyStudyLeaderboard> monthlyStudyLeaderboard() async {
    calls += 1;
    if (error != null) {
      throw error!;
    }
    return leaderboard!;
  }
}

MonthlyStudyLeaderboard _leaderboard(String start) => MonthlyStudyLeaderboard(
      monthStart: start,
      monthEnd: '2026-09-30',
      entries: const [],
      currentUser: null,
    );
