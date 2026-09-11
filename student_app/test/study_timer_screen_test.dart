import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/data/study_session_models.dart';
import 'package:synapse_neetug/features/learning/presentation/study_timer_screen.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  testWidgets('shows the idle timer and starts with a safe context request',
      (tester) async {
    final api = _ScreenTimerApi(next: _session(StudySessionStatus.inProgress));
    await _pumpScreen(tester, api);

    expect(find.text('00:00:00'), findsOneWidget);
    expect(find.text('Start'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.text('Start'));
    await tester.pump();
    await tester.pump();

    expect(api.startCalls, 1);
    expect(api.startedContext!.toJson(), {'contextType': 'GENERAL'});
    expect(find.text('Pause'), findsOneWidget);
  });

  testWidgets('renders active and paused controls without duration input', (tester) async {
    final api = _ScreenTimerApi(
      current: _session(StudySessionStatus.inProgress, seconds: 5),
    );
    await _pumpScreen(tester, api);

    expect(find.text('00:00:05'), findsOneWidget);
    expect(find.text('Pause'), findsOneWidget);
    expect(find.text('Complete'), findsOneWidget);
    expect(find.text('Abandon'), findsOneWidget);
    expect(find.text('session-1'), findsNothing);
    await tester.pump(const Duration(seconds: 1));
    expect(api.currentCalls, 1);

    api.next = _session(StudySessionStatus.paused, seconds: 6);
    await tester.tap(find.text('Pause'));
    await tester.pump();
    await tester.pump();
    expect(api.actions, ['pause']);
    expect(find.text('Resume'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('00:00:06'), findsOneWidget);
  });

  testWidgets('wires resume and complete to canonical server responses', (tester) async {
    final api = _ScreenTimerApi(
      current: _session(StudySessionStatus.paused, seconds: 12),
    );
    await _pumpScreen(tester, api);

    api.next = _session(StudySessionStatus.inProgress, seconds: 12);
    await tester.tap(find.text('Resume'));
    await tester.pump();
    await tester.pump();
    expect(api.actions, ['resume']);
    expect(find.text('Pause'), findsOneWidget);

    api.next = _session(
      StudySessionStatus.completed,
      seconds: 20,
      finalSeconds: 20,
    );
    await tester.tap(find.text('Complete'));
    await tester.pump();
    await tester.pump();
    expect(api.actions, ['resume', 'complete']);
    expect(find.text('Session completed'), findsOneWidget);
    expect(find.text('Study time: 00:00:20'), findsOneWidget);
  });

  testWidgets('renders abandoned state without presenting completed duration',
      (tester) async {
    final api = _ScreenTimerApi(current: _session(StudySessionStatus.abandoned));
    await _pumpScreen(tester, api);

    expect(find.text('Session abandoned'), findsOneWidget);
    expect(
      find.text('This session was not counted as completed study time.'),
      findsOneWidget,
    );
    expect(find.textContaining('Study time:'), findsNothing);
    expect(find.text('Start a new session'), findsOneWidget);
  });
}

Future<void> _pumpScreen(WidgetTester tester, _ScreenTimerApi api) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [learningApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: StudyTimerScreen()),
    ),
  );
  await tester.pump();
  await tester.pump();
}

class _ScreenTimerApi extends LearningApiService {
  StudySession? current;
  StudySession? next;
  StudySessionStartContext? startedContext;
  int startCalls = 0;
  int currentCalls = 0;
  final List<String> actions = <String>[];

  _ScreenTimerApi({this.current, this.next}) : super(Dio());

  @override
  Future<StudySession?> currentStudySession() async {
    currentCalls += 1;
    return current;
  }

  @override
  Future<StudySession> startStudySession(StudySessionStartContext context) async {
    startCalls += 1;
    startedContext = context;
    return next!;
  }

  @override
  Future<StudySession> pauseStudySession(String id) => _action('pause');

  @override
  Future<StudySession> resumeStudySession(String id) => _action('resume');

  @override
  Future<StudySession> completeStudySession(String id) => _action('complete');

  Future<StudySession> _action(String action) async {
    actions.add(action);
    return next!;
  }
}

StudySession _session(
  StudySessionStatus status, {
  int seconds = 0,
  int? finalSeconds,
}) =>
    StudySession(
      id: 'session-1',
      status: status,
      contextType: StudySessionContextType.general,
      hierarchy: const StudySessionHierarchy(),
      startedAt: DateTime.utc(2026, 9, 10, 10),
      pausedAt: status == StudySessionStatus.paused
          ? DateTime.utc(2026, 9, 10, 10, 1)
          : null,
      completedAt: status == StudySessionStatus.completed
          ? DateTime.utc(2026, 9, 10, 10, 1)
          : null,
      abandonedAt: status == StudySessionStatus.abandoned
          ? DateTime.utc(2026, 9, 10, 10, 1)
          : null,
      accumulatedSeconds: seconds,
      finalDurationSeconds: finalSeconds,
      currentDurationSeconds: seconds,
      createdAt: DateTime.utc(2026, 9, 10, 10),
      updatedAt: DateTime.utc(2026, 9, 10, 10),
    );
