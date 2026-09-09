import 'package:dio/dio.dart';
import 'learning_models.dart';

class LearningApiService {
  final Dio dio;
  LearningApiService(this.dio);
  Future<List<LearningVideo>> videos({String? topicId}) async {
    final r = await dio.get('/learning/videos',
        queryParameters: {if (topicId != null) 'topicId': topicId});
    return ((r.data as List?) ?? [])
        .cast<Map<String, dynamic>>()
        .map(LearningVideo.fromJson)
        .toList();
  }

  Future<List<RevisionItem>> revisions({String? topicId, String? type}) async {
    final r = await dio.get('/learning/revision', queryParameters: {
      if (topicId != null) 'topicId': topicId,
      if (type != null) 'type': type
    });
    return ((r.data as List?) ?? [])
        .cast<Map<String, dynamic>>()
        .map(RevisionItem.fromJson)
        .toList();
  }

  Future<LearningVideo> video(String id) async =>
      LearningVideo.fromJson((await dio.get('/learning/videos/$id')).data);
  Future<VideoPlayback> playback(String id) async => VideoPlayback.fromJson(
      (await dio.get('/learning/videos/$id/playback')).data);
  Future<VideoProgress> progress(String id) async => VideoProgress.fromJson(
      (await dio.get('/learning/videos/$id/progress')).data);
  Future<VideoProgress> sync(String id, int pos, int watched) async =>
      VideoProgress.fromJson((await dio.put('/learning/videos/$id/progress',
              data: {'lastPositionSeconds': pos, 'watchedSeconds': watched}))
          .data);
  Future<List<LearningTopic>> chapter(String id) async {
    final r = await dio.get('/learning/chapters/$id');
    return ((r.data['topics'] as List?) ?? [])
        .cast<Map<String, dynamic>>()
        .map(LearningTopic.fromJson)
        .toList();
  }
  Future<List<Flashcard>> flashcards(String topicId) async {final r=await dio.get('/learning/flashcards/session',queryParameters:{'topicId':topicId});return ((r.data as List?)??[]).map((x)=>Flashcard.fromJson(Map<String,dynamic>.from(x as Map))).toList();} Future<void> reviewFlashcard(String id,String result)=>dio.post('/learning/flashcards/$id/review',data:{'result':result});

  Future<QuestionPage> questions(QuestionFilters filters) async {
    final response = await dio.get(
      '/learning/questions',
      queryParameters: filters.toQuery(),
    );
    return QuestionPage.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<StudentQuestion> question(String id) async {
    final response = await dio.get('/learning/questions/$id');
    return StudentQuestion.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<PracticeSession> createPracticeSession(
    QuestionFilters filters, {
    required int questionCount,
  }) async {
    final response = await dio.post(
      '/learning/question-practice-sessions',
      data: {
        ...(filters.toQuery()
          ..remove('page')
          ..remove('limit')),
        'questionCount': questionCount,
      },
    );
    return PracticeSession.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<PracticeSession> practiceSession(String id) async {
    final response = await dio.get('/learning/question-practice-sessions/$id');
    return PracticeSession.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<PracticeAnswer> answerPracticeItem(
    String sessionId,
    String itemId, {
    required String selectedOptionId,
    int? timeSpentSeconds,
  }) async {
    final response = await dio.post(
      '/learning/question-practice-sessions/$sessionId/items/$itemId/answer',
      data: {
        'selectedOptionId': selectedOptionId,
        if (timeSpentSeconds != null) 'timeSpentSeconds': timeSpentSeconds,
      },
    );
    return PracticeAnswer.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<PracticeSession> completePracticeSession(String id) async {
    final response = await dio.post('/learning/question-practice-sessions/$id/complete');
    return PracticeSession.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<PracticeHistoryPage> practiceHistory({int page = 1, int limit = 20}) async {
    final response = await dio.get(
      '/learning/question-practice-sessions',
      queryParameters: {'page': page, 'limit': limit},
    );
    return PracticeHistoryPage.fromJson(Map<String, dynamic>.from(response.data as Map));
  }
}
