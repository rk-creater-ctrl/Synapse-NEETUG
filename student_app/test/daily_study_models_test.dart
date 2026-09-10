import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/daily_study_models.dart';

void main() {
  final moduleJson = <String, dynamic>{
    'id': 'module-1',
    'studyDate': '2026-09-10',
    'status': 'IN_PROGRESS',
    'progress': {
      'totalTasks': 4,
      'pendingTasks': 1,
      'inProgressTasks': 1,
      'completedTasks': 1,
      'skippedTasks': 1,
      'finishedTasks': 2,
      'completionPercent': 50,
    },
    'subjects': [
      {
        'subject': {'id': 'physics', 'name': 'Physics', 'slug': 'physics'},
        'progress': {
          'totalTasks': 1,
          'pendingTasks': 1,
          'inProgressTasks': 0,
          'completedTasks': 0,
          'skippedTasks': 0,
          'finishedTasks': 0,
          'completionPercent': 0,
        },
        'tasks': [
          {
            'id': 'task-1',
            'taskType': 'QUESTION',
            'status': 'PENDING',
            'displayOrder': 1,
            'available': true,
            'content': {
              'id': 'question-1',
              'stem': 'Safe question',
              'type': 'SINGLE_CORRECT_MCQ',
              'difficulty': 'MEDIUM',
              'tags': ['units'],
              'options': [
                {'id': 'option-1', 'position': 1, 'text': 'One'},
              ],
            },
          },
        ],
      },
    ],
  };

  test('parses overall and per-subject Daily Study progress', () {
    final module = DailyStudyModule.fromJson(moduleJson);
    expect(module.progress.finishedTasks, 2);
    expect(module.progress.completionPercent, 50);
    expect(module.subjects.single.progress.pendingTasks, 1);
  });

  test('parses learner-safe question content without answer fields', () {
    final task = DailyStudyModule.fromJson(moduleJson).subjects.single.tasks.single;
    final question = task.content as DailyStudyQuestionContent;
    expect(question.stem, 'Safe question');
    expect(question.options.single.text, 'One');
  });

  test('parses flashcard, revision, video and unavailable content safely', () {
    DailyStudyTask task(String type, Object? content) => DailyStudyTask.fromJson({
          'id': type,
          'taskType': type,
          'status': 'IN_PROGRESS',
          'displayOrder': 1,
          'available': content != null,
          'content': content,
        });

    expect(task('FLASHCARD', {'id': 'f', 'frontContent': 'front', 'backContent': 'back'}).content,
        isA<DailyStudyFlashcardContent>());
    expect(task('REVISION', {'id': 'r', 'title': 'note', 'type': 'NOTE', 'content': 'text'}).content,
        isA<DailyStudyRevisionContent>());
    expect(task('VIDEO', {'id': 'v', 'title': 'lesson'}).content,
        isA<DailyStudyVideoContent>());
    expect(task('QUESTION', null).content, isNull);
  });

  test('parses all Daily Study task statuses', () {
    for (final entry in {
      'PENDING': DailyStudyTaskStatus.pending,
      'IN_PROGRESS': DailyStudyTaskStatus.inProgress,
      'COMPLETED': DailyStudyTaskStatus.completed,
      'SKIPPED': DailyStudyTaskStatus.skipped,
    }.entries) {
      expect(DailyStudyTaskStatusWire.fromWire(entry.key), entry.value);
    }
  });
}
