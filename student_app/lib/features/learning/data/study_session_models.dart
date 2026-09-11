Map<String, dynamic> _studySessionMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

int _studySessionInt(Object? value) => value is num ? value.toInt() : 0;

enum StudySessionStatus { inProgress, paused, completed, abandoned, unknown }

extension StudySessionStatusWire on StudySessionStatus {
  static StudySessionStatus fromWire(Object? value) => switch (value?.toString()) {
        'IN_PROGRESS' => StudySessionStatus.inProgress,
        'PAUSED' => StudySessionStatus.paused,
        'COMPLETED' => StudySessionStatus.completed,
        'ABANDONED' => StudySessionStatus.abandoned,
        _ => StudySessionStatus.unknown,
      };

  String get label => switch (this) {
        StudySessionStatus.inProgress => 'In progress',
        StudySessionStatus.paused => 'Paused',
        StudySessionStatus.completed => 'Completed',
        StudySessionStatus.abandoned => 'Abandoned',
        StudySessionStatus.unknown => 'Unknown',
      };
}

enum StudySessionContextType {
  general,
  video,
  flashcard,
  questionPractice,
  test,
  revision,
  dailyStudy,
  unknown,
}

extension StudySessionContextTypeWire on StudySessionContextType {
  static StudySessionContextType fromWire(Object? value) => switch (value?.toString()) {
        'GENERAL' => StudySessionContextType.general,
        'VIDEO' => StudySessionContextType.video,
        'FLASHCARD' => StudySessionContextType.flashcard,
        'QUESTION_PRACTICE' => StudySessionContextType.questionPractice,
        'TEST' => StudySessionContextType.test,
        'REVISION' => StudySessionContextType.revision,
        'DAILY_STUDY' => StudySessionContextType.dailyStudy,
        _ => StudySessionContextType.unknown,
      };

  String get wireValue => switch (this) {
        StudySessionContextType.general => 'GENERAL',
        StudySessionContextType.video => 'VIDEO',
        StudySessionContextType.flashcard => 'FLASHCARD',
        StudySessionContextType.questionPractice => 'QUESTION_PRACTICE',
        StudySessionContextType.test => 'TEST',
        StudySessionContextType.revision => 'REVISION',
        StudySessionContextType.dailyStudy => 'DAILY_STUDY',
        StudySessionContextType.unknown => 'GENERAL',
      };

  String get label => switch (this) {
        StudySessionContextType.general => 'General',
        StudySessionContextType.video => 'Video',
        StudySessionContextType.flashcard => 'Flashcard',
        StudySessionContextType.questionPractice => 'Question Practice',
        StudySessionContextType.test => 'Test',
        StudySessionContextType.revision => 'Revision',
        StudySessionContextType.dailyStudy => 'Daily Study',
        StudySessionContextType.unknown => 'General',
      };
}

class StudySessionHierarchyNode {
  final String id;
  final String name;
  final String slug;

  const StudySessionHierarchyNode({
    required this.id,
    required this.name,
    required this.slug,
  });

  factory StudySessionHierarchyNode.fromJson(Map<String, dynamic> json) =>
      StudySessionHierarchyNode(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        slug: json['slug']?.toString() ?? '',
      );
}

class StudySessionHierarchy {
  final StudySessionHierarchyNode? subject;
  final StudySessionHierarchyNode? chapter;
  final StudySessionHierarchyNode? topic;
  final StudySessionHierarchyNode? subtopic;

  const StudySessionHierarchy({
    this.subject,
    this.chapter,
    this.topic,
    this.subtopic,
  });

  factory StudySessionHierarchy.fromJson(Map<String, dynamic> json) {
    StudySessionHierarchyNode? node(String key) {
      final value = _studySessionMap(json[key]);
      return value.isEmpty ? null : StudySessionHierarchyNode.fromJson(value);
    }

    return StudySessionHierarchy(
      subject: node('subject'),
      chapter: node('chapter'),
      topic: node('topic'),
      subtopic: node('subtopic'),
    );
  }

  String get label => [subject?.name, chapter?.name, topic?.name, subtopic?.name]
      .whereType<String>()
      .where((name) => name.isNotEmpty)
      .join(' · ');
}

class StudySessionStartContext {
  final StudySessionContextType contextType;
  final String? subjectId;
  final String? chapterId;
  final String? topicId;
  final String? subtopicId;

  const StudySessionStartContext({
    this.contextType = StudySessionContextType.general,
    this.subjectId,
    this.chapterId,
    this.topicId,
    this.subtopicId,
  });

  Map<String, dynamic> toJson() => {
        'contextType': contextType.wireValue,
        if (subjectId?.isNotEmpty == true) 'subjectId': subjectId,
        if (chapterId?.isNotEmpty == true) 'chapterId': chapterId,
        if (topicId?.isNotEmpty == true) 'topicId': topicId,
        if (subtopicId?.isNotEmpty == true) 'subtopicId': subtopicId,
      };
}

class StudySession {
  final String id;
  final StudySessionStatus status;
  final StudySessionContextType contextType;
  final StudySessionHierarchy hierarchy;
  final DateTime? startedAt;
  final DateTime? pausedAt;
  final DateTime? completedAt;
  final DateTime? abandonedAt;
  final int accumulatedSeconds;
  final int? finalDurationSeconds;
  final int currentDurationSeconds;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const StudySession({
    required this.id,
    required this.status,
    required this.contextType,
    required this.hierarchy,
    required this.startedAt,
    required this.pausedAt,
    required this.completedAt,
    required this.abandonedAt,
    required this.accumulatedSeconds,
    required this.finalDurationSeconds,
    required this.currentDurationSeconds,
    required this.createdAt,
    required this.updatedAt,
  });

  factory StudySession.fromJson(Map<String, dynamic> json) => StudySession(
        id: json['id']?.toString() ?? '',
        status: StudySessionStatusWire.fromWire(json['status']),
        contextType: StudySessionContextTypeWire.fromWire(json['contextType']),
        hierarchy: StudySessionHierarchy.fromJson(_studySessionMap(json['hierarchy'])),
        startedAt: DateTime.tryParse(json['startedAt']?.toString() ?? ''),
        pausedAt: DateTime.tryParse(json['pausedAt']?.toString() ?? ''),
        completedAt: DateTime.tryParse(json['completedAt']?.toString() ?? ''),
        abandonedAt: DateTime.tryParse(json['abandonedAt']?.toString() ?? ''),
        accumulatedSeconds: _studySessionInt(json['accumulatedSeconds']),
        finalDurationSeconds: json['finalDurationSeconds'] is num
            ? (json['finalDurationSeconds'] as num).toInt()
            : null,
        currentDurationSeconds: _studySessionInt(json['currentDurationSeconds']),
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
        updatedAt: DateTime.tryParse(json['updatedAt']?.toString() ?? ''),
      );
}
