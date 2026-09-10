import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../main.dart';
import '../data/daily_study_models.dart';
import '../data/learning_api_service.dart';
import '../data/learning_models.dart';
import '../data/test_models.dart';

final learningApiProvider =
    Provider((ref) => LearningApiService(ref.read(dioProvider)));
final topicVideosProvider = FutureProvider.family<List<LearningVideo>, String>(
    (ref, id) => ref.read(learningApiProvider).videos(topicId: id));
final topicRevisionProvider = FutureProvider.family<List<RevisionItem>, String>(
    (ref, id) => ref.read(learningApiProvider).revisions(topicId: id));
final chapterTopicsProvider =
    FutureProvider.family<List<LearningTopic>, String>(
        (ref, id) => ref.read(learningApiProvider).chapter(id));

final questionPageProvider = FutureProvider.family<QuestionPage, QuestionFilters>(
  (ref, filters) => ref.read(learningApiProvider).questions(filters),
);

final practiceSessionProvider = FutureProvider.family<PracticeSession, String>(
  (ref, id) => ref.read(learningApiProvider).practiceSession(id),
);

final practiceHistoryProvider = FutureProvider.family<PracticeHistoryPage, int>(
  (ref, page) => ref.read(learningApiProvider).practiceHistory(page: page),
);

final studentTestsProvider = FutureProvider.family<StudentTestPage, int>(
  (ref, page) => ref.read(learningApiProvider).tests(page: page),
);

final studentTestDetailProvider =
    FutureProvider.family<StudentTestDetail, String>(
  (ref, id) => ref.read(learningApiProvider).testDetail(id),
);

final formalTestAttemptProvider =
    FutureProvider.family<FormalTestAttempt, String>(
  (ref, id) => ref.read(learningApiProvider).testAttempt(id),
);

final testResultProvider = FutureProvider.family<TestResult, String>(
  (ref, id) => ref.read(learningApiProvider).testResult(id),
);

final testReviewProvider = FutureProvider.family<TestReview, String>(
  (ref, id) => ref.read(learningApiProvider).testReview(id),
);

final dailyStudyProvider = StateNotifierProvider.autoDispose.family<
    DailyStudyController, AsyncValue<DailyStudyModule>, String>(
  (ref, date) => DailyStudyController(ref.read(learningApiProvider), date)..load(),
);

class DailyStudyController extends StateNotifier<AsyncValue<DailyStudyModule>> {
  final LearningApiService _api;
  final String _date;

  DailyStudyController(this._api, this._date)
      : super(const AsyncValue.loading());

  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      state = AsyncValue.data(await _api.dailyStudy(_date));
    } catch (error, stackTrace) {
      state = AsyncValue.error(error, stackTrace);
    }
  }

  Future<void> updateTaskStatus(
    String taskId,
    DailyStudyTaskStatus status,
  ) async {
    if (status == DailyStudyTaskStatus.pending) {
      throw ArgumentError.value(status, 'status', 'PENDING is not a task mutation target.');
    }
    final module = await _api.updateDailyStudyTaskStatus(taskId, status);
    state = AsyncValue.data(module);
  }
}
