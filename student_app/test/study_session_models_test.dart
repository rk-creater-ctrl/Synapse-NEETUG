import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/study_session_models.dart';

void main() {
  test('parses an in-progress session and its safe hierarchy', () {
    final session = StudySession.fromJson(_sessionJson());

    expect(session.status, StudySessionStatus.inProgress);
    expect(session.contextType, StudySessionContextType.dailyStudy);
    expect(session.currentDurationSeconds, 125);
    expect(session.finalDurationSeconds, isNull);
    expect(session.hierarchy.subject?.name, 'Physics');
    expect(session.hierarchy.chapter?.name, 'Motion');
  });

  test('parses paused, completed, and abandoned duration states', () {
    expect(
      StudySession.fromJson(_sessionJson(status: 'PAUSED')).status,
      StudySessionStatus.paused,
    );
    expect(
      StudySession.fromJson(
        _sessionJson(status: 'COMPLETED', finalDurationSeconds: 600),
      ).finalDurationSeconds,
      600,
    );
    final abandoned = StudySession.fromJson(_sessionJson(status: 'ABANDONED'));
    expect(abandoned.status, StudySessionStatus.abandoned);
    expect(abandoned.finalDurationSeconds, isNull);
  });

  test('maps known and unknown wire enum values defensively', () {
    expect(
      StudySessionStatusWire.fromWire('COMPLETED'),
      StudySessionStatus.completed,
    );
    expect(
      StudySessionContextTypeWire.fromWire('QUESTION_PRACTICE'),
      StudySessionContextType.questionPractice,
    );
    expect(
      StudySessionStatusWire.fromWire('FUTURE_STATUS'),
      StudySessionStatus.unknown,
    );
  });

  test('start context sends only supported learner-selected fields', () {
    final payload = const StudySessionStartContext(
      contextType: StudySessionContextType.video,
      subjectId: 'subject-1',
      topicId: 'topic-1',
    ).toJson();

    expect(payload, {
      'contextType': 'VIDEO',
      'subjectId': 'subject-1',
      'topicId': 'topic-1',
    });
    expect(payload.containsKey('studentId'), isFalse);
    expect(payload.containsKey('startedAt'), isFalse);
    expect(payload.containsKey('currentDurationSeconds'), isFalse);
  });
}

Map<String, dynamic> _sessionJson({
  String status = 'IN_PROGRESS',
  int? finalDurationSeconds,
}) => {
      'id': 'session-1',
      'status': status,
      'contextType': 'DAILY_STUDY',
      'hierarchy': {
        'subject': {'id': 'subject-1', 'name': 'Physics', 'slug': 'physics'},
        'chapter': {'id': 'chapter-1', 'name': 'Motion', 'slug': 'motion'},
        'topic': null,
        'subtopic': null,
      },
      'startedAt': '2026-09-10T10:00:00.000Z',
      'pausedAt': null,
      'completedAt': null,
      'abandonedAt': null,
      'accumulatedSeconds': 120,
      'finalDurationSeconds': finalDurationSeconds,
      'currentDurationSeconds': 125,
      'createdAt': '2026-09-10T10:00:00.000Z',
      'updatedAt': '2026-09-10T10:02:05.000Z',
    };
