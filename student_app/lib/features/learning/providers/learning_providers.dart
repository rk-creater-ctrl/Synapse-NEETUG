import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../main.dart';
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
