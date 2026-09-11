import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_session_models.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  test('loads the current server session and represents no current session', () async {
    final api = _TimerApi(current: _session(StudySessionStatus.inProgress));
    final controller = StudySessionController(api);

    await controller.loadCurrent();

    expect(api.currentCalls, 1);
    expect(_sessionState(controller)!.id, 'session-1');
    controller.dispose();

    final idle = StudySessionController(_TimerApi());
    await idle.loadCurrent();
    expect(_sessionState(idle), isNull);
    idle.dispose();
  });

  test('start forwards only learner-selected context and uses the server response',
      () async {
    final api = _TimerApi(next: _session(StudySessionStatus.inProgress));
    final controller = StudySessionController(api);
    const context = StudySessionStartContext(
      contextType: StudySessionContextType.revision,
      subjectId: 'subject-1',
    );

    await controller.start(context);

    expect(api.startContext, context);
    expect(api.startContext!.toJson(), {
      'contextType': 'REVISION',
      'subjectId': 'subject-1',
    });
    expect(_sessionState(controller)!.status, StudySessionStatus.inProgress);
    controller.dispose();
  });

  test('pause, resume, complete, and abandon replace canonical state', () async {
    final api = _TimerApi(next: _session(StudySessionStatus.paused));
    final controller = StudySessionController(api);

    await controller.pause('session-1');
    expect(_sessionState(controller)!.status, StudySessionStatus.paused);
    api.next = _session(StudySessionStatus.inProgress);
    await controller.resume('session-1');
    expect(_sessionState(controller)!.status, StudySessionStatus.inProgress);
    api.next = _session(StudySessionStatus.completed, finalDurationSeconds: 321);
    await controller.complete('session-1');
    expect(_sessionState(controller)!.finalDurationSeconds, 321);
    api.next = _session(StudySessionStatus.abandoned);
    await controller.abandon('session-1');
    expect(_sessionState(controller)!.status, StudySessionStatus.abandoned);
    expect(api.actions, ['pause', 'resume', 'complete', 'abandon']);
    controller.dispose();
  });

  test('preserves the prior state when a mutation fails without reloading', () async {
    final api = _TimerApi(
      current: _session(StudySessionStatus.inProgress, currentDurationSeconds: 10),
      error: StateError('offline'),
    );
    final controller = StudySessionController(api);
    await controller.loadCurrent();

    await expectLater(controller.pause('session-1'), throwsA(isA<StateError>()));

    expect(_sessionState(controller)!.currentDurationSeconds, 10);
    expect(api.currentCalls, 1);
    controller.dispose();
  });

  test('prevents a duplicate in-flight mutation without polling the backend', () async {
    final pending = Completer<StudySession>();
    final api = _TimerApi(current: _session(StudySessionStatus.inProgress), pending: pending);
    final controller = StudySessionController(api);
    await controller.loadCurrent();

    final first = controller.pause('session-1');
    final second = controller.pause('session-1');
    expect(api.actions, ['pause']);
    expect(api.currentCalls, 1);
    pending.complete(_session(StudySessionStatus.paused));
    await Future.wait([first, second]);

    expect(_sessionState(controller)!.status, StudySessionStatus.paused);
    controller.dispose();
  });
}

StudySession? _sessionState(StudySessionController controller) {
  final state = controller.state;
  expect(state, isA<AsyncData<StudySession?>>());
  return (state as AsyncData<StudySession?>).value;
}

class _TimerApi extends LearningApiService {
  StudySession? current;
  StudySession? next;
  Object? error;
  Completer<StudySession>? pending;
  StudySessionStartContext? startContext;
  int currentCalls = 0;
  final List<String> actions = <String>[];

  _TimerApi({this.current, this.next, this.error, this.pending}) : super(Dio());

  @override
  Future<StudySession?> currentStudySession() async {
    currentCalls += 1;
    return current;
  }

  @override
  Future<StudySession> startStudySession(StudySessionStartContext context) {
    startContext = context;
    return _respond();
  }

  @override
  Future<StudySession> pauseStudySession(String id) => _action('pause');

  @override
  Future<StudySession> resumeStudySession(String id) => _action('resume');

  @override
  Future<StudySession> completeStudySession(String id) => _action('complete');

  @override
  Future<StudySession> abandonStudySession(String id) => _action('abandon');

  Future<StudySession> _action(String action) {
    actions.add(action);
    return _respond();
  }

  Future<StudySession> _respond() {
    if (error != null) {
      return Future<StudySession>.error(error!);
    }
    if (pending != null) {
      return pending!.future;
    }
    return Future<StudySession>.value(next ?? current!);
  }
}

StudySession _session(
  StudySessionStatus status, {
  int currentDurationSeconds = 120,
  int? finalDurationSeconds,
}) =>
    StudySession(
      id: 'session-1',
      status: status,
      contextType: StudySessionContextType.general,
      hierarchy: const StudySessionHierarchy(),
      startedAt: DateTime.utc(2026, 9, 10, 10),
      pausedAt: status == StudySessionStatus.paused ? DateTime.utc(2026, 9, 10, 10, 2) : null,
      completedAt: status == StudySessionStatus.completed ? DateTime.utc(2026, 9, 10, 10, 3) : null,
      abandonedAt: status == StudySessionStatus.abandoned ? DateTime.utc(2026, 9, 10, 10, 3) : null,
      accumulatedSeconds: currentDurationSeconds,
      finalDurationSeconds: finalDurationSeconds,
      currentDurationSeconds: currentDurationSeconds,
      createdAt: DateTime.utc(2026, 9, 10, 10),
      updatedAt: DateTime.utc(2026, 9, 10, 10),
    );
