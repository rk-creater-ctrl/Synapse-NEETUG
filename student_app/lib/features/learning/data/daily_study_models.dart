Map<String, dynamic> _dailyMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

int _dailyInt(Object? value) => value is num ? value.toInt() : 0;

enum DailyStudyTaskStatus { pending, inProgress, completed, skipped }

extension DailyStudyTaskStatusWire on DailyStudyTaskStatus {
  String get wireValue => switch (this) {
        DailyStudyTaskStatus.pending => 'PENDING',
        DailyStudyTaskStatus.inProgress => 'IN_PROGRESS',
        DailyStudyTaskStatus.completed => 'COMPLETED',
        DailyStudyTaskStatus.skipped => 'SKIPPED',
      };

  bool get isTerminal =>
      this == DailyStudyTaskStatus.completed || this == DailyStudyTaskStatus.skipped;

  static DailyStudyTaskStatus fromWire(Object? value) => switch (value?.toString()) {
        'IN_PROGRESS' => DailyStudyTaskStatus.inProgress,
        'COMPLETED' => DailyStudyTaskStatus.completed,
        'SKIPPED' => DailyStudyTaskStatus.skipped,
        _ => DailyStudyTaskStatus.pending,
      };
}

enum DailyStudyTaskType { question, flashcard, revision, video, unknown }

extension DailyStudyTaskTypeWire on DailyStudyTaskType {
  static DailyStudyTaskType fromWire(Object? value) => switch (value?.toString()) {
        'QUESTION' => DailyStudyTaskType.question,
        'FLASHCARD' => DailyStudyTaskType.flashcard,
        'REVISION' => DailyStudyTaskType.revision,
        'VIDEO' => DailyStudyTaskType.video,
        _ => DailyStudyTaskType.unknown,
      };

  String get label => switch (this) {
        DailyStudyTaskType.question => 'Question',
        DailyStudyTaskType.flashcard => 'Flashcard',
        DailyStudyTaskType.revision => 'Revision',
        DailyStudyTaskType.video => 'Video',
        DailyStudyTaskType.unknown => 'Learning task',
      };
}

class DailyStudyProgress {
  final int totalTasks;
  final int pendingTasks;
  final int inProgressTasks;
  final int completedTasks;
  final int skippedTasks;
  final int finishedTasks;
  final int completionPercent;

  const DailyStudyProgress({
    required this.totalTasks,
    required this.pendingTasks,
    required this.inProgressTasks,
    required this.completedTasks,
    required this.skippedTasks,
    required this.finishedTasks,
    required this.completionPercent,
  });

  factory DailyStudyProgress.fromJson(Map<String, dynamic> json) => DailyStudyProgress(
        totalTasks: _dailyInt(json['totalTasks']),
        pendingTasks: _dailyInt(json['pendingTasks']),
        inProgressTasks: _dailyInt(json['inProgressTasks']),
        completedTasks: _dailyInt(json['completedTasks']),
        skippedTasks: _dailyInt(json['skippedTasks']),
        finishedTasks: _dailyInt(json['finishedTasks']),
        completionPercent: _dailyInt(json['completionPercent']),
      );

  static const empty = DailyStudyProgress(
    totalTasks: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    completedTasks: 0,
    skippedTasks: 0,
    finishedTasks: 0,
    completionPercent: 0,
  );
}

class DailyStudyHierarchyNode {
  final String id;
  final String name;

  const DailyStudyHierarchyNode({required this.id, required this.name});

  factory DailyStudyHierarchyNode.fromJson(Map<String, dynamic> json) =>
      DailyStudyHierarchyNode(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
      );
}

class DailyStudyHierarchy {
  final DailyStudyHierarchyNode? chapter;
  final DailyStudyHierarchyNode? topic;
  final DailyStudyHierarchyNode? subtopic;

  const DailyStudyHierarchy({this.chapter, this.topic, this.subtopic});

  factory DailyStudyHierarchy.fromJson(Map<String, dynamic> json) {
    DailyStudyHierarchyNode? node(String key) {
      final value = _dailyMap(json[key]);
      return value.isEmpty ? null : DailyStudyHierarchyNode.fromJson(value);
    }

    return DailyStudyHierarchy(
      chapter: node('chapter'),
      topic: node('topic'),
      subtopic: node('subtopic'),
    );
  }

  String get label => [chapter?.name, topic?.name, subtopic?.name]
      .whereType<String>()
      .where((name) => name.isNotEmpty)
      .join(' · ');
}

class DailyStudyQuestionOption {
  final String id;
  final int position;
  final String text;

  const DailyStudyQuestionOption({
    required this.id,
    required this.position,
    required this.text,
  });

  factory DailyStudyQuestionOption.fromJson(Map<String, dynamic> json) =>
      DailyStudyQuestionOption(
        id: json['id']?.toString() ?? '',
        position: _dailyInt(json['position']),
        text: json['text']?.toString() ?? '',
      );
}

abstract class DailyStudyContent {
  final String id;
  const DailyStudyContent(this.id);
}

class DailyStudyQuestionContent extends DailyStudyContent {
  final String stem;
  final String type;
  final String difficulty;
  final List<String> tags;
  final List<DailyStudyQuestionOption> options;

  const DailyStudyQuestionContent({
    required String id,
    required this.stem,
    required this.type,
    required this.difficulty,
    required this.tags,
    required this.options,
  }) : super(id);

  factory DailyStudyQuestionContent.fromJson(Map<String, dynamic> json) =>
      DailyStudyQuestionContent(
        id: json['id']?.toString() ?? '',
        stem: json['stem']?.toString() ?? '',
        type: json['type']?.toString() ?? '',
        difficulty: json['difficulty']?.toString() ?? '',
        tags: (json['tags'] as List? ?? const []).map((tag) => tag.toString()).toList(),
        options: (json['options'] as List? ?? const [])
            .map((item) => DailyStudyQuestionOption.fromJson(_dailyMap(item)))
            .toList(),
      );
}

class DailyStudyFlashcardContent extends DailyStudyContent {
  final String title;
  final String frontContent;
  final String backContent;
  final String? explanation;
  final String? imageUrl;

  const DailyStudyFlashcardContent({
    required String id,
    required this.title,
    required this.frontContent,
    required this.backContent,
    this.explanation,
    this.imageUrl,
  }) : super(id);

  factory DailyStudyFlashcardContent.fromJson(Map<String, dynamic> json) =>
      DailyStudyFlashcardContent(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        frontContent: json['frontContent']?.toString() ?? '',
        backContent: json['backContent']?.toString() ?? '',
        explanation: json['explanation']?.toString(),
        imageUrl: json['imageUrl']?.toString(),
      );
}

class DailyStudyRevisionContent extends DailyStudyContent {
  final String title;
  final String type;
  final String content;

  const DailyStudyRevisionContent({
    required String id,
    required this.title,
    required this.type,
    required this.content,
  }) : super(id);

  factory DailyStudyRevisionContent.fromJson(Map<String, dynamic> json) =>
      DailyStudyRevisionContent(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        type: json['type']?.toString() ?? '',
        content: json['content']?.toString() ?? '',
      );
}

class DailyStudyVideoContent extends DailyStudyContent {
  final String title;
  final String? description;
  final String? instructorName;
  final String? thumbnailUrl;
  final int? durationSeconds;

  const DailyStudyVideoContent({
    required String id,
    required this.title,
    this.description,
    this.instructorName,
    this.thumbnailUrl,
    this.durationSeconds,
  }) : super(id);

  factory DailyStudyVideoContent.fromJson(Map<String, dynamic> json) =>
      DailyStudyVideoContent(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        description: json['description']?.toString(),
        instructorName: json['instructorName']?.toString(),
        thumbnailUrl: json['thumbnailUrl']?.toString(),
        durationSeconds: json['durationSeconds'] is num
            ? (json['durationSeconds'] as num).toInt()
            : null,
      );
}

class DailyStudyTask {
  final String id;
  final DailyStudyTaskType type;
  final DailyStudyTaskStatus status;
  final int displayOrder;
  final DailyStudyHierarchy hierarchy;
  final bool available;
  final DailyStudyContent? content;

  const DailyStudyTask({
    required this.id,
    required this.type,
    required this.status,
    required this.displayOrder,
    required this.hierarchy,
    required this.available,
    required this.content,
  });

  factory DailyStudyTask.fromJson(Map<String, dynamic> json) {
    final type = DailyStudyTaskTypeWire.fromWire(json['taskType']);
    final contentJson = _dailyMap(json['content']);
    final available = json['available'] == true;
    final DailyStudyContent? content = !available || contentJson.isEmpty
        ? null
        : switch (type) {
            DailyStudyTaskType.question => DailyStudyQuestionContent.fromJson(contentJson),
            DailyStudyTaskType.flashcard => DailyStudyFlashcardContent.fromJson(contentJson),
            DailyStudyTaskType.revision => DailyStudyRevisionContent.fromJson(contentJson),
            DailyStudyTaskType.video => DailyStudyVideoContent.fromJson(contentJson),
            DailyStudyTaskType.unknown => null,
          };
    return DailyStudyTask(
      id: json['id']?.toString() ?? '',
      type: type,
      status: DailyStudyTaskStatusWire.fromWire(json['status']),
      displayOrder: _dailyInt(json['displayOrder']),
      hierarchy: DailyStudyHierarchy.fromJson(_dailyMap(json['hierarchy'])),
      available: available,
      content: content,
    );
  }
}

class DailyStudySubject {
  final String id;
  final String name;
  final String slug;
  final DailyStudyProgress progress;
  final List<DailyStudyTask> tasks;

  const DailyStudySubject({
    required this.id,
    required this.name,
    required this.slug,
    required this.progress,
    required this.tasks,
  });

  factory DailyStudySubject.fromJson(Map<String, dynamic> json) {
    final subject = _dailyMap(json['subject']);
    return DailyStudySubject(
      id: subject['id']?.toString() ?? '',
      name: subject['name']?.toString() ?? '',
      slug: subject['slug']?.toString() ?? '',
      progress: DailyStudyProgress.fromJson(_dailyMap(json['progress'])),
      tasks: (json['tasks'] as List? ?? const [])
          .map((item) => DailyStudyTask.fromJson(_dailyMap(item)))
          .toList(),
    );
  }
}

class DailyStudyModule {
  final String id;
  final String studyDate;
  final String status;
  final DateTime? generatedAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DailyStudyProgress progress;
  final List<DailyStudySubject> subjects;

  const DailyStudyModule({
    required this.id,
    required this.studyDate,
    required this.status,
    required this.generatedAt,
    required this.startedAt,
    required this.completedAt,
    required this.progress,
    required this.subjects,
  });

  factory DailyStudyModule.fromJson(Map<String, dynamic> json) => DailyStudyModule(
        id: json['id']?.toString() ?? '',
        studyDate: json['studyDate']?.toString() ?? '',
        status: json['status']?.toString() ?? 'NOT_STARTED',
        generatedAt: DateTime.tryParse(json['generatedAt']?.toString() ?? ''),
        startedAt: DateTime.tryParse(json['startedAt']?.toString() ?? ''),
        completedAt: DateTime.tryParse(json['completedAt']?.toString() ?? ''),
        progress: DailyStudyProgress.fromJson(_dailyMap(json['progress'])),
        subjects: (json['subjects'] as List? ?? const [])
            .map((item) => DailyStudySubject.fromJson(_dailyMap(item)))
            .toList(),
      );
}
