import 'learning_models.dart';

Map<String, dynamic> _asMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

class StudentTest {
  final String id;
  final String title;
  final String? description;
  final int durationMinutes;
  final double totalMarks;
  final bool isFree;
  final DateTime? availableFrom;
  final DateTime? availableUntil;
  final int sectionCount;

  const StudentTest({
    required this.id,
    required this.title,
    required this.description,
    required this.durationMinutes,
    required this.totalMarks,
    required this.isFree,
    required this.availableFrom,
    required this.availableUntil,
    required this.sectionCount,
  });

  factory StudentTest.fromJson(Map<String, dynamic> json) => StudentTest(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? 'Test',
        description: json['description']?.toString(),
        durationMinutes: json['durationMinutes'] as int? ?? 0,
        totalMarks: (json['totalMarks'] as num? ?? 0).toDouble(),
        isFree: json['isFree'] == true,
        availableFrom: DateTime.tryParse(json['availableFrom']?.toString() ?? ''),
        availableUntil: DateTime.tryParse(json['availableUntil']?.toString() ?? ''),
        sectionCount: json['sectionCount'] as int? ?? 0,
      );
}

class StudentTestPage {
  final List<StudentTest> items;
  final int page;
  final int totalPages;

  const StudentTestPage({
    required this.items,
    required this.page,
    required this.totalPages,
  });

  factory StudentTestPage.fromJson(Map<String, dynamic> json) {
    final meta = _asMap(json['meta']);
    return StudentTestPage(
      items: (json['items'] as List? ?? const [])
          .map((item) => StudentTest.fromJson(_asMap(item)))
          .toList(),
      page: meta['page'] as int? ?? 1,
      totalPages: meta['totalPages'] as int? ?? 0,
    );
  }
}

class TestSectionSummary {
  final String id;
  final String title;
  final String? instructions;
  final int displayOrder;
  final int questionCount;

  const TestSectionSummary({
    required this.id,
    required this.title,
    required this.instructions,
    required this.displayOrder,
    required this.questionCount,
  });

  factory TestSectionSummary.fromJson(Map<String, dynamic> json) =>
      TestSectionSummary(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? 'Section',
        instructions: json['instructions']?.toString(),
        displayOrder: json['displayOrder'] as int? ?? 0,
        questionCount: json['questionCount'] as int? ?? 0,
      );
}

class StudentTestDetail extends StudentTest {
  final String? instructions;
  final int totalQuestionCount;
  final List<TestSectionSummary> sections;

  const StudentTestDetail({
    required super.id,
    required super.title,
    required super.description,
    required super.durationMinutes,
    required super.totalMarks,
    required super.isFree,
    required super.availableFrom,
    required super.availableUntil,
    required super.sectionCount,
    required this.instructions,
    required this.totalQuestionCount,
    required this.sections,
  });

  factory StudentTestDetail.fromJson(Map<String, dynamic> json) {
    final sections = (json['sections'] as List? ?? const [])
        .map((item) => TestSectionSummary.fromJson(_asMap(item)))
        .toList();
    return StudentTestDetail(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Test',
      description: json['description']?.toString(),
      instructions: json['instructions']?.toString(),
      durationMinutes: json['durationMinutes'] as int? ?? 0,
      totalMarks: (json['totalMarks'] as num? ?? 0).toDouble(),
      isFree: json['isFree'] == true,
      availableFrom: DateTime.tryParse(json['availableFrom']?.toString() ?? ''),
      availableUntil: DateTime.tryParse(json['availableUntil']?.toString() ?? ''),
      sectionCount: sections.length,
      totalQuestionCount: json['totalQuestionCount'] as int? ?? 0,
      sections: sections,
    );
  }
}

class ActiveTestQuestion {
  final String id;
  final int displayOrder;
  final double marks;
  final double negativeMarks;
  final String questionId;
  final String stem;
  final List<QuestionOption> options;
  final String? selectedOptionId;
  final bool isMarkedForReview;
  final bool answered;

  const ActiveTestQuestion({
    required this.id,
    required this.displayOrder,
    required this.marks,
    required this.negativeMarks,
    required this.questionId,
    required this.stem,
    required this.options,
    required this.selectedOptionId,
    required this.isMarkedForReview,
    required this.answered,
  });

  factory ActiveTestQuestion.fromJson(Map<String, dynamic> json) {
    final question = _asMap(json['question']);
    return ActiveTestQuestion(
      id: json['id']?.toString() ?? '',
      displayOrder: json['displayOrder'] as int? ?? 0,
      marks: (json['marks'] as num? ?? 0).toDouble(),
      negativeMarks: (json['negativeMarks'] as num? ?? 0).toDouble(),
      questionId: question['id']?.toString() ?? '',
      stem: question['stem']?.toString() ?? '',
      options: (question['options'] as List? ?? const [])
          .map((item) => QuestionOption.fromJson(_asMap(item)))
          .toList(),
      selectedOptionId: json['selectedOptionId']?.toString(),
      isMarkedForReview: json['isMarkedForReview'] == true,
      answered: json['answered'] == true,
    );
  }
}

class ActiveTestSection {
  final String id;
  final String title;
  final String? instructions;
  final int displayOrder;
  final List<ActiveTestQuestion> questions;

  const ActiveTestSection({
    required this.id,
    required this.title,
    required this.instructions,
    required this.displayOrder,
    required this.questions,
  });

  factory ActiveTestSection.fromJson(Map<String, dynamic> json) =>
      ActiveTestSection(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? 'Section',
        instructions: json['instructions']?.toString(),
        displayOrder: json['displayOrder'] as int? ?? 0,
        questions: (json['questions'] as List? ?? const [])
            .map((item) => ActiveTestQuestion.fromJson(_asMap(item)))
            .toList(),
      );
}

class FormalTestAttempt {
  final String id;
  final String testId;
  final String status;
  final DateTime startedAt;
  final DateTime deadlineAt;
  final String testTitle;
  final String? testDescription;
  final String? testInstructions;
  final int durationMinutes;
  final double totalMarks;
  final List<ActiveTestSection> sections;

  const FormalTestAttempt({
    required this.id,
    required this.testId,
    required this.status,
    required this.startedAt,
    required this.deadlineAt,
    required this.testTitle,
    required this.testDescription,
    required this.testInstructions,
    required this.durationMinutes,
    required this.totalMarks,
    required this.sections,
  });

  factory FormalTestAttempt.fromJson(Map<String, dynamic> json) {
    final test = _asMap(json['test']);
    return FormalTestAttempt(
      id: json['id']?.toString() ?? '',
      testId: test['id']?.toString() ?? json['testId']?.toString() ?? '',
      status: json['status']?.toString() ?? 'IN_PROGRESS',
      startedAt: DateTime.tryParse(json['startedAt']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      deadlineAt: DateTime.tryParse(json['deadlineAt']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      testTitle: test['title']?.toString() ?? 'Test',
      testDescription: test['description']?.toString(),
      testInstructions: test['instructions']?.toString(),
      durationMinutes: test['durationMinutes'] as int? ?? 0,
      totalMarks: (test['totalMarks'] as num? ?? 0).toDouble(),
      sections: (json['sections'] as List? ?? const [])
          .map((item) => ActiveTestSection.fromJson(_asMap(item)))
          .toList(),
    );
  }
}

class TestResult {
  final String attemptId;
  final String testId;
  final String status;
  final String testTitle;
  final double score;
  final double totalMarks;
  final int correctCount;
  final int incorrectCount;
  final int unansweredCount;
  final int totalQuestionCount;

  const TestResult({
    required this.attemptId,
    required this.testId,
    required this.status,
    required this.testTitle,
    required this.score,
    required this.totalMarks,
    required this.correctCount,
    required this.incorrectCount,
    required this.unansweredCount,
    required this.totalQuestionCount,
  });

  factory TestResult.fromJson(Map<String, dynamic> json) => TestResult(
        attemptId: json['attemptId']?.toString() ?? '',
        testId: json['testId']?.toString() ?? '',
        status: json['status']?.toString() ?? '',
        testTitle: json['testTitle']?.toString() ?? 'Test',
        score: (json['score'] as num? ?? 0).toDouble(),
        totalMarks: (json['totalMarks'] as num? ?? 0).toDouble(),
        correctCount: json['correctCount'] as int? ?? 0,
        incorrectCount: json['incorrectCount'] as int? ?? 0,
        unansweredCount: json['unansweredCount'] as int? ?? 0,
        totalQuestionCount: json['totalQuestionCount'] as int? ?? 0,
      );
}

class ReviewQuestion extends ActiveTestQuestion {
  final String? explanation;
  final bool? isCorrect;
  final double? awardedMarks;
  final List<ReviewOption> reviewOptions;

  const ReviewQuestion({
    required super.id,
    required super.displayOrder,
    required super.marks,
    required super.negativeMarks,
    required super.questionId,
    required super.stem,
    required super.options,
    required super.selectedOptionId,
    required super.isMarkedForReview,
    required super.answered,
    required this.explanation,
    required this.isCorrect,
    required this.awardedMarks,
    required this.reviewOptions,
  });

  factory ReviewQuestion.fromJson(Map<String, dynamic> json) {
    final options = (json['options'] as List? ?? const [])
        .map((item) => ReviewOption.fromJson(_asMap(item)))
        .toList();
    return ReviewQuestion(
      id: json['testQuestionId']?.toString() ?? '',
      displayOrder: json['displayOrder'] as int? ?? 0,
      marks: (json['marks'] as num? ?? 0).toDouble(),
      negativeMarks: (json['negativeMarks'] as num? ?? 0).toDouble(),
      questionId: json['questionId']?.toString() ?? '',
      stem: json['stem']?.toString() ?? '',
      options: options,
      selectedOptionId: json['selectedOptionId']?.toString(),
      isMarkedForReview: json['isMarkedForReview'] == true,
      answered: json['answered'] == true,
      explanation: json['explanation']?.toString(),
      isCorrect: json['isCorrect'] as bool?,
      awardedMarks: (json['awardedMarks'] as num?)?.toDouble(),
      reviewOptions: options,
    );
  }
}

class ReviewOption extends QuestionOption {
  final bool isCorrect;

  const ReviewOption({
    required super.id,
    required super.position,
    required super.text,
    required this.isCorrect,
  });

  factory ReviewOption.fromJson(Map<String, dynamic> json) => ReviewOption(
        id: json['id']?.toString() ?? '',
        position: json['position'] as int? ?? 0,
        text: json['text']?.toString() ?? '',
        isCorrect: json['isCorrect'] == true,
      );
}

class TestReviewSection {
  final String id;
  final String title;
  final String? instructions;
  final int displayOrder;
  final int questionCount;
  final int correctCount;
  final int incorrectCount;
  final int unansweredCount;
  final double score;
  final List<ReviewQuestion> questions;

  const TestReviewSection({
    required this.id,
    required this.title,
    required this.instructions,
    required this.displayOrder,
    required this.questionCount,
    required this.correctCount,
    required this.incorrectCount,
    required this.unansweredCount,
    required this.score,
    required this.questions,
  });

  factory TestReviewSection.fromJson(Map<String, dynamic> json) =>
      TestReviewSection(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? 'Section',
        instructions: json['instructions']?.toString(),
        displayOrder: json['displayOrder'] as int? ?? 0,
        questionCount: json['questionCount'] as int? ?? 0,
        correctCount: json['correctCount'] as int? ?? 0,
        incorrectCount: json['incorrectCount'] as int? ?? 0,
        unansweredCount: json['unansweredCount'] as int? ?? 0,
        score: (json['score'] as num? ?? 0).toDouble(),
        questions: (json['questions'] as List? ?? const [])
            .map((item) => ReviewQuestion.fromJson(_asMap(item)))
            .toList(),
      );
}

class TestReview {
  final String attemptId;
  final String testId;
  final String status;
  final String testTitle;
  final List<TestReviewSection> sections;

  const TestReview({
    required this.attemptId,
    required this.testId,
    required this.status,
    required this.testTitle,
    required this.sections,
  });

  factory TestReview.fromJson(Map<String, dynamic> json) => TestReview(
        attemptId: json['attemptId']?.toString() ?? '',
        testId: json['testId']?.toString() ?? '',
        status: json['status']?.toString() ?? '',
        testTitle: json['testTitle']?.toString() ?? 'Test',
        sections: (json['sections'] as List? ?? const [])
            .map((item) => TestReviewSection.fromJson(_asMap(item)))
            .toList(),
      );
}

Duration remainingUntil(DateTime deadline, DateTime now) {
  final remaining = deadline.difference(now);
  return remaining.isNegative ? Duration.zero : remaining;
}
