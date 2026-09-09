class LearningVideo {
  final String id, title;
  final String? instructorName;
  final int? durationSeconds;
  final bool isFree;
  const LearningVideo(
      {required this.id,
      required this.title,
      this.instructorName,
      this.durationSeconds,
      required this.isFree});
  factory LearningVideo.fromJson(Map<String, dynamic> j) => LearningVideo(
      id: j['id'] as String,
      title: j['title'] as String,
      instructorName: j['instructorName'] as String?,
      durationSeconds: j['durationSeconds'] as int?,
      isFree: j['isFree'] as bool? ?? true);
}

class VideoProgress {
  final int lastPositionSeconds, watchedSeconds;
  final double completionPercentage;
  final bool completed;
  const VideoProgress(
      {required this.lastPositionSeconds,
      required this.watchedSeconds,
      required this.completionPercentage,
      required this.completed});
  factory VideoProgress.fromJson(Map<String, dynamic>? j) => VideoProgress(
      lastPositionSeconds: j?['lastPositionSeconds'] as int? ?? 0,
      watchedSeconds: j?['watchedSeconds'] as int? ?? 0,
      completionPercentage:
          (j?['completionPercentage'] as num? ?? 0).toDouble(),
      completed: j?['completed'] as bool? ?? false);
}

class VideoPlayback {
  final String? playbackUrl;
  final String provider;
  const VideoPlayback({this.playbackUrl, required this.provider});
  factory VideoPlayback.fromJson(Map<String, dynamic> j) => VideoPlayback(
      playbackUrl: j['playbackUrl'] as String?,
      provider: j['provider'] as String);
}

class LearningTopic {
  final String id, name;
  final int videoCount, revisionCount, flashcardCount;
  const LearningTopic(
      {required this.id,
      required this.name,
      required this.videoCount,
      required this.revisionCount,
      required this.flashcardCount});
  factory LearningTopic.fromJson(Map<String, dynamic> j) {
    final c = j['_count'] as Map<String, dynamic>? ?? {};
    return LearningTopic(
        id: j['id'] as String,
        name: j['name'] as String,
        videoCount: c['videos'] as int? ?? 0,
        revisionCount: c['revisionItems'] as int? ?? 0,
        flashcardCount: c['flashcards'] as int? ?? 0);
  }
}

class RevisionItem {
  final String id, title, type, content;
  const RevisionItem(
      {required this.id,
      required this.title,
      required this.type,
      required this.content});
  factory RevisionItem.fromJson(Map<String, dynamic> j) => RevisionItem(
      id: j['id'] as String,
      title: j['title'] as String,
      type: j['type'] as String,
      content: j['content'] as String? ?? '');
}
class Flashcard { final String id,frontContent,backContent; final String? explanation; const Flashcard({required this.id,required this.frontContent,required this.backContent,this.explanation}); factory Flashcard.fromJson(Map<String,dynamic> j)=>Flashcard(id:j['id'] as String,frontContent:j['frontContent'] as String,backContent:j['backContent'] as String,explanation:j['explanation'] as String?); }

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

class QuestionOption {
  final String id;
  final int position;
  final String text;

  const QuestionOption({required this.id, required this.position, required this.text});

  factory QuestionOption.fromJson(Map<String, dynamic> json) => QuestionOption(
        id: json['id']?.toString() ?? '',
        position: json['position'] as int? ?? 0,
        text: json['text']?.toString() ?? '',
      );
}

class QuestionPyqMetadata {
  final String sourceExam;
  final int year;
  final String sessionKey;
  final String paperKey;
  final int questionNumber;

  const QuestionPyqMetadata({
    required this.sourceExam,
    required this.year,
    required this.sessionKey,
    required this.paperKey,
    required this.questionNumber,
  });

  factory QuestionPyqMetadata.fromJson(Map<String, dynamic> json) =>
      QuestionPyqMetadata(
        sourceExam: json['sourceExam']?.toString() ?? '',
        year: json['year'] as int? ?? 0,
        sessionKey: json['sessionKey']?.toString() ?? '',
        paperKey: json['paperKey']?.toString() ?? '',
        questionNumber: json['questionNumber'] as int? ?? 0,
      );
}

class StudentQuestion {
  final String id;
  final String type;
  final String sourceType;
  final String stem;
  final String difficulty;
  final List<String> tags;
  final List<QuestionOption> options;
  final QuestionPyqMetadata? pyqMetadata;
  final String? subjectName;
  final String? chapterName;
  final String? topicName;

  const StudentQuestion({
    required this.id,
    required this.type,
    required this.sourceType,
    required this.stem,
    required this.difficulty,
    required this.tags,
    required this.options,
    required this.pyqMetadata,
    this.subjectName,
    this.chapterName,
    this.topicName,
  });

  factory StudentQuestion.fromJson(Map<String, dynamic> json) {
    final options = (json['options'] as List? ?? const [])
        .map((item) => QuestionOption.fromJson(_map(item)))
        .toList();
    final pyq = _map(json['pyqMetadata']);
    return StudentQuestion(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'SINGLE_CORRECT_MCQ',
      sourceType: json['sourceType']?.toString() ?? 'CURATED',
      stem: json['stem']?.toString() ?? '',
      difficulty: json['difficulty']?.toString() ?? 'MEDIUM',
      tags: (json['tags'] as List? ?? const []).map((tag) => tag.toString()).toList(),
      options: options,
      pyqMetadata: pyq.isEmpty ? null : QuestionPyqMetadata.fromJson(pyq),
      subjectName: _map(json['subject'])['name']?.toString(),
      chapterName: _map(json['chapter'])['name']?.toString(),
      topicName: _map(json['topic'])['name']?.toString(),
    );
  }
}

class QuestionFilters {
  final int page;
  final int limit;
  final String? examId;
  final String? subjectId;
  final String? classId;
  final String? chapterId;
  final String? topicId;
  final String? subtopicId;
  final bool? pyqOnly;
  final int? pyqYear;
  final String? difficulty;
  final String? tag;

  const QuestionFilters({
    this.page = 1,
    this.limit = 20,
    this.examId,
    this.subjectId,
    this.classId,
    this.chapterId,
    this.topicId,
    this.subtopicId,
    this.pyqOnly,
    this.pyqYear,
    this.difficulty,
    this.tag,
  });

  Map<String, dynamic> toQuery() => {
        'page': page,
        'limit': limit,
        if (examId?.isNotEmpty == true) 'examId': examId,
        if (subjectId?.isNotEmpty == true) 'subjectId': subjectId,
        if (classId?.isNotEmpty == true) 'classId': classId,
        if (chapterId?.isNotEmpty == true) 'chapterId': chapterId,
        if (topicId?.isNotEmpty == true) 'topicId': topicId,
        if (subtopicId?.isNotEmpty == true) 'subtopicId': subtopicId,
        if (pyqOnly != null) 'pyqOnly': pyqOnly,
        if (pyqYear != null) 'pyqYear': pyqYear,
        if (difficulty?.isNotEmpty == true) 'difficulty': difficulty,
        if (tag?.isNotEmpty == true) 'tag': tag,
      };
}

class QuestionPage {
  final List<StudentQuestion> items;
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  const QuestionPage({required this.items, required this.page, required this.limit, required this.total, required this.totalPages});

  factory QuestionPage.fromJson(Map<String, dynamic> json) {
    final meta = _map(json['meta']);
    return QuestionPage(
      items: (json['items'] as List? ?? const []).map((item) => StudentQuestion.fromJson(_map(item))).toList(),
      page: meta['page'] as int? ?? 1,
      limit: meta['limit'] as int? ?? 20,
      total: meta['total'] as int? ?? 0,
      totalPages: meta['totalPages'] as int? ?? 0,
    );
  }
}

class PracticeSummary {
  final int totalQuestions;
  final int answeredQuestions;
  final int correctAnswers;
  final int incorrectAnswers;
  final int unansweredQuestions;
  final double accuracyPercentage;

  const PracticeSummary({required this.totalQuestions, required this.answeredQuestions, required this.correctAnswers, required this.incorrectAnswers, required this.unansweredQuestions, required this.accuracyPercentage});

  factory PracticeSummary.fromJson(Map<String, dynamic> json) => PracticeSummary(
        totalQuestions: json['totalQuestions'] as int? ?? 0,
        answeredQuestions: json['answeredQuestions'] as int? ?? 0,
        correctAnswers: json['correctAnswers'] as int? ?? 0,
        incorrectAnswers: json['incorrectAnswers'] as int? ?? 0,
        unansweredQuestions: json['unansweredQuestions'] as int? ?? 0,
        accuracyPercentage: (json['accuracyPercentage'] as num? ?? 0).toDouble(),
      );
}

class PracticeAnswer {
  final String selectedOptionId;
  final bool isCorrect;
  final String correctOptionId;
  final String explanation;
  final int? timeSpentSeconds;

  const PracticeAnswer({required this.selectedOptionId, required this.isCorrect, required this.correctOptionId, required this.explanation, this.timeSpentSeconds});

  factory PracticeAnswer.fromJson(Map<String, dynamic> json) => PracticeAnswer(
        selectedOptionId: json['selectedOptionId']?.toString() ?? '',
        isCorrect: json['isCorrect'] == true,
        correctOptionId: json['correctOptionId']?.toString() ?? '',
        explanation: json['explanation']?.toString() ?? '',
        timeSpentSeconds: json['timeSpentSeconds'] as int?,
      );
}

class PracticeItem {
  final String id;
  final int sequence;
  final bool unavailable;
  final StudentQuestion? question;
  final PracticeAnswer? answer;

  const PracticeItem({required this.id, required this.sequence, required this.unavailable, this.question, this.answer});

  bool get answered => answer != null;

  factory PracticeItem.fromJson(Map<String, dynamic> json) {
    final question = _map(json['question']);
    final answer = _map(json['answer']);
    return PracticeItem(
      id: json['id']?.toString() ?? '',
      sequence: json['sequence'] as int? ?? 0,
      unavailable: json['unavailable'] == true,
      question: question.isEmpty ? null : StudentQuestion.fromJson(question),
      answer: answer.isEmpty ? null : PracticeAnswer.fromJson(answer),
    );
  }
}

class PracticeSession {
  final String id;
  final String status;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final PracticeSummary summary;
  final List<PracticeItem> items;

  const PracticeSession({required this.id, required this.status, required this.startedAt, required this.completedAt, required this.summary, required this.items});

  factory PracticeSession.fromJson(Map<String, dynamic> json) => PracticeSession(
        id: json['id']?.toString() ?? '',
        status: json['status']?.toString() ?? 'IN_PROGRESS',
        startedAt: DateTime.tryParse(json['startedAt']?.toString() ?? ''),
        completedAt: DateTime.tryParse(json['completedAt']?.toString() ?? ''),
        summary: PracticeSummary.fromJson(_map(json['summary'])),
        items: (json['items'] as List? ?? const []).map((item) => PracticeItem.fromJson(_map(item))).toList(),
      );
}

class PracticeHistoryPage {
  final List<PracticeSession> items;
  final int page;
  final int totalPages;

  const PracticeHistoryPage({required this.items, required this.page, required this.totalPages});

  factory PracticeHistoryPage.fromJson(Map<String, dynamic> json) {
    final meta = _map(json['meta']);
    return PracticeHistoryPage(
      items: (json['items'] as List? ?? const []).map((item) => PracticeSession.fromJson(_map(item))).toList(),
      page: meta['page'] as int? ?? 1,
      totalPages: meta['totalPages'] as int? ?? 0,
    );
  }
}
