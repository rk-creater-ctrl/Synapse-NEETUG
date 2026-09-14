import 'package:dio/dio.dart';
import 'daily_study_models.dart';
import 'study_session_models.dart';
import 'study_analytics_models.dart';
import 'study_leaderboard_models.dart';
import 'learning_models.dart';
import 'mentor_discovery_models.dart';
import 'test_models.dart';

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

  Future<StudentTestPage> tests({int page = 1, int limit = 20}) async {
    final response = await dio.get(
      '/learning/tests',
      queryParameters: {'page': page, 'limit': limit},
    );
    return StudentTestPage.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<StudentTestDetail> testDetail(String id) async {
    final response = await dio.get('/learning/tests/$id');
    return StudentTestDetail.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<String> startTestAttempt(String testId) async {
    final response = await dio.post('/learning/tests/$testId/attempts');
    return Map<String, dynamic>.from(response.data as Map)['id'].toString();
  }

  Future<FormalTestAttempt> testAttempt(String attemptId) async {
    final response = await dio.get('/learning/test-attempts/$attemptId');
    return FormalTestAttempt.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<void> saveTestAnswer(
    String attemptId,
    String testQuestionId, {
    String? selectedOptionId,
    required bool markForReview,
  }) async {
    await dio.put(
      '/learning/test-attempts/$attemptId/questions/$testQuestionId/answer',
      data: {
        'selectedOptionId': selectedOptionId,
        'markForReview': markForReview,
      },
    );
  }

  Future<TestResult> submitTestAttempt(String attemptId) async {
    final response = await dio.post('/learning/test-attempts/$attemptId/submit');
    return TestResult.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<TestResult> testResult(String attemptId) async {
    final response = await dio.get('/learning/test-attempts/$attemptId/result');
    return TestResult.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<TestReview> testReview(String attemptId) async {
    final response = await dio.get('/learning/test-attempts/$attemptId/review');
    return TestReview.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<DailyStudyModule> dailyStudy(String date) async {
    final response = await dio.get(
      '/learning/daily-study',
      queryParameters: {'date': date},
    );
    return DailyStudyModule.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<DailyStudyModule> updateDailyStudyTaskStatus(
    String taskId,
    DailyStudyTaskStatus status,
  ) async {
    final response = await dio.patch(
      '/learning/daily-study/tasks/$taskId/status',
      data: {'status': status.wireValue},
    );
    return DailyStudyModule.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<StudySession> startStudySession(StudySessionStartContext context) async {
    final response = await dio.post(
      '/learning/study-sessions',
      data: context.toJson(),
    );
    return StudySession.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<StudySession?> currentStudySession() async {
    final response = await dio.get('/learning/study-sessions/current');
    if (response.data == null) {
      return null;
    }
    return StudySession.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<StudySession> studySession(String id) async {
    final response = await dio.get('/learning/study-sessions/$id');
    return StudySession.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<StudySession> pauseStudySession(String id) =>
      _studySessionAction(id, 'pause');

  Future<StudySession> resumeStudySession(String id) =>
      _studySessionAction(id, 'resume');

  Future<StudySession> completeStudySession(String id) =>
      _studySessionAction(id, 'complete');

  Future<StudySession> abandonStudySession(String id) =>
      _studySessionAction(id, 'abandon');

  Future<StudySession> _studySessionAction(String id, String action) async {
    final response = await dio.post('/learning/study-sessions/$id/$action');
    return StudySession.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<StudyAnalytics> studyAnalytics() async {
    final response = await dio.get('/learning/study-analytics');
    return StudyAnalytics.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<DailyStudyLeaderboard> dailyStudyLeaderboard() async {
    final response = await dio.get('/learning/study-leaderboard/daily');
    return DailyStudyLeaderboard.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<WeeklyStudyLeaderboard> weeklyStudyLeaderboard() async {
    final response = await dio.get('/learning/study-leaderboard/weekly');
    return WeeklyStudyLeaderboard.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<MonthlyStudyLeaderboard> monthlyStudyLeaderboard() async {
    final response = await dio.get('/learning/study-leaderboard/monthly');
    return MonthlyStudyLeaderboard.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<List<StudentMentor>> mentors(MentorDiscoveryFilters filters) async {
    final response = await dio.get('/mentors', queryParameters: filters.toQuery());
    return (response.data as List? ?? const [])
        .map((item) => StudentMentor.fromJson(Map<String, dynamic>.from(item as Map)))
        .toList();
  }

  Future<StudentMentorDetail> mentor(String id) async {
    final response = await dio.get('/mentors/$id');
    return StudentMentorDetail.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<List<MentorDiscoverySubject>> mentorSubjects() async {
    final response = await dio.get('/academics/subjects');
    final body = Map<String, dynamic>.from(response.data as Map);
    return (body['data'] as List? ?? const [])
        .map((item) => MentorDiscoverySubject.fromJson(Map<String, dynamic>.from(item as Map)))
        .toList();
  }

  Future<MentorBookableSlots> mentorBookableSlots(String mentorId, String date) async {
    final response = await dio.get('/mentors/$mentorId/bookable-slots', queryParameters: {'date': date});
    return MentorBookableSlots.fromJson(Map<String, dynamic>.from(response.data as Map));
  }

  Future<MentorBooking> createMentorBooking(String mentorId, DateTime scheduledStartAt) async {
    final response = await dio.post('/mentor-bookings', data: {
      'mentorId': mentorId,
      'scheduledStartAt': scheduledStartAt.toUtc().toIso8601String(),
    });
    return MentorBooking.fromJson(Map<String, dynamic>.from(response.data as Map));
  }
}
