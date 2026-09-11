import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_analytics_models.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  test('loads and refreshes personal analytics through the learning API', () async {
    final api = _AnalyticsApi(analytics: _analytics(600));
    final container = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    expect((await container.read(studyAnalyticsProvider.future)).today.totalSeconds, 600);
    container.invalidate(studyAnalyticsProvider);
    api.analytics = _analytics(900);
    expect((await container.read(studyAnalyticsProvider.future)).today.totalSeconds, 900);
    expect(api.calls, 2);
  });

  test('exposes an API failure from the read-only analytics provider', () async {
    final api = _AnalyticsApi(error: StateError('offline'));
    final container = ProviderContainer(
      overrides: [learningApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(studyAnalyticsProvider.future),
      throwsA(isA<StateError>()),
    );
  });
}

class _AnalyticsApi extends LearningApiService {
  StudyAnalytics? analytics;
  Object? error;
  int calls = 0;

  _AnalyticsApi({this.analytics, this.error}) : super(Dio());

  @override
  Future<StudyAnalytics> studyAnalytics() async {
    calls += 1;
    if (error != null) {
      throw error!;
    }
    return analytics!;
  }
}

StudyAnalytics _analytics(int seconds) => StudyAnalytics(
      today: _period(seconds),
      week: _period(seconds),
      month: _period(seconds),
      allTime: _period(seconds),
      bySubject: const [],
      byContextType: const [],
      recentDays: const [],
    );

StudyAnalyticsPeriod _period(int seconds) => StudyAnalyticsPeriod(
      totalSeconds: seconds,
      sessionCount: seconds == 0 ? 0 : 1,
      averageSessionSeconds: seconds,
    );
