import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_leaderboard_models.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  test('loads and refreshes the daily leaderboard', () async {
    final api = _LeaderboardApi(leaderboard: _leaderboard('2026-09-11'));
    final container = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    expect((await container.read(dailyStudyLeaderboardProvider.future)).date, '2026-09-11');
    container.invalidate(dailyStudyLeaderboardProvider);
    api.leaderboard = _leaderboard('2026-09-12');
    expect((await container.read(dailyStudyLeaderboardProvider.future)).date, '2026-09-12');
    expect(api.calls, 2);
  });

  test('exposes a daily leaderboard API error', () async {
    final api = _LeaderboardApi(error: StateError('offline'));
    final container = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(dailyStudyLeaderboardProvider.future),
      throwsA(isA<StateError>()),
    );
  });
}

class _LeaderboardApi extends LearningApiService {
  DailyStudyLeaderboard? leaderboard;
  Object? error;
  int calls = 0;

  _LeaderboardApi({this.leaderboard, this.error}) : super(Dio());

  @override
  Future<DailyStudyLeaderboard> dailyStudyLeaderboard() async {
    calls += 1;
    if (error != null) {
      throw error!;
    }
    return leaderboard!;
  }
}

DailyStudyLeaderboard _leaderboard(String date) => DailyStudyLeaderboard(
      date: date,
      entries: const [],
      currentUser: null,
    );
