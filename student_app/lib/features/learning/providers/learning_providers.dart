import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../main.dart';
import '../data/learning_api_service.dart';
import '../data/learning_models.dart';

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
