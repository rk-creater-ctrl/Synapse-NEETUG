import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/daily_study_models.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/presentation/daily_study_screen.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  testWidgets('renders backend progress and PCB subject order', (tester) async {
    final api = _ScreenDailyStudyApi(module: _module(
      progress: _progress(total: 4, finished: 2, percent: 50),
      subjects: [
        _subject('physics', _progress(total: 2, finished: 1, percent: 50)),
        _subject('chemistry', _progress(total: 2, finished: 2, percent: 100)),
        _subject('biology', _progress(total: 1, finished: 0, percent: 0)),
      ],
    ));

    await _pumpScreen(tester, api);

    expect(api.requestedDates.single, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect(find.textContaining('2 / 4 tasks finished'), findsOneWidget);
    expect(find.textContaining('50%'), findsNWidgets(2));
    expect(find.textContaining('100%'), findsOneWidget);
    expect(_textPosition(tester, 'Physics'), lessThan(_textPosition(tester, 'Chemistry')));
    expect(_textPosition(tester, 'Chemistry'), lessThan(_textPosition(tester, 'Biology')));
  });

  testWidgets('shows lifecycle controls only for mutable task states', (tester) async {
    final api = _ScreenDailyStudyApi(module: _module(
      subjects: [
        _subject('physics', _progress(), tasks: [
          _task('pending', DailyStudyTaskStatus.pending),
          _task('active', DailyStudyTaskStatus.inProgress),
          _task('done', DailyStudyTaskStatus.completed),
          _task('skipped', DailyStudyTaskStatus.skipped),
        ]),
      ],
    ));

    await _pumpScreen(tester, api);

    expect(find.text('Start'), findsOneWidget);
    expect(find.text('Complete'), findsNWidgets(2));
    expect(find.text('Skip'), findsNWidgets(2));
    expect(find.text('COMPLETED'), findsOneWidget);
    expect(find.text('SKIPPED'), findsOneWidget);
  });

  testWidgets('starts a task once and trusts the server progress response', (tester) async {
    final initial = _module(
      progress: _progress(total: 1, finished: 0, percent: 0),
      subjects: [
        _subject('physics', _progress(total: 1, finished: 0, percent: 0), tasks: [
          _task('task-physics-1', DailyStudyTaskStatus.pending),
        ]),
      ],
    );
    final api = _ScreenDailyStudyApi(
      module: initial,
      mutationResult: _module(
        progress: _progress(total: 1, finished: 0, percent: 37),
        subjects: [
          _subject('physics', _progress(total: 1, finished: 0, percent: 37), tasks: [
            _task('task-physics-1', DailyStudyTaskStatus.inProgress),
          ]),
        ],
      ),
    );

    await _pumpScreen(tester, api);
    await tester.tap(find.text('Start'));
    await tester.pump();
    await tester.pump();

    expect(api.mutations, [('task-physics-1', DailyStudyTaskStatus.inProgress)]);
    expect(api.requestedDates, hasLength(1));
    expect(find.textContaining('37%'), findsNWidgets(2));
  });

  testWidgets('prevents a duplicate tap while a task mutation is pending', (tester) async {
    final completer = Completer<DailyStudyModule>();
    final api = _ScreenDailyStudyApi(
      module: _module(subjects: [
        _subject('physics', _progress(), tasks: [
          _task('task-physics-1', DailyStudyTaskStatus.pending),
        ]),
      ]),
      pendingMutation: completer,
    );
    await _pumpScreen(tester, api);

    await tester.tap(find.text('Start'));
    await tester.pump();
    await tester.tap(find.text('Start'));
    await tester.pump();

    expect(api.mutations, hasLength(1));
    completer.complete(api.module);
    await tester.pump();
  });

  testWidgets('renders unavailable and zero-task modules safely', (tester) async {
    final api = _ScreenDailyStudyApi(module: _module(
      subjects: [
        _subject('physics', _progress(total: 1), tasks: [
          DailyStudyTask(
            id: 'unavailable',
            type: DailyStudyTaskType.question,
            status: DailyStudyTaskStatus.pending,
            displayOrder: 1,
            hierarchy: const DailyStudyHierarchy(),
            available: false,
            content: null,
          ),
        ]),
      ],
    ));
    await _pumpScreen(tester, api);
    expect(find.text('This task is no longer available.'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await _pumpScreen(tester, _ScreenDailyStudyApi(module: _module()));
    expect(find.text('No Daily Study tasks are available for this date.'), findsOneWidget);
    expect(find.text('No Daily Study tasks are available for this subject.'), findsNWidgets(3));
  });

  testWidgets('opens safe question and video content without answer or playback data', (tester) async {
    final api = _ScreenDailyStudyApi(module: _module(
      subjects: [
        _subject('physics', _progress(total: 2), tasks: [
          _task('question', DailyStudyTaskStatus.pending),
          _task('video', DailyStudyTaskStatus.pending, type: DailyStudyTaskType.video),
        ]),
      ],
    ));
    await _pumpScreen(tester, api);

    await tester.tap(find.text('Open').first);
    await tester.pumpAndSettle();
    expect(find.text('Safe question stem'), findsWidgets);
    expect(find.text('Option one'), findsOneWidget);
    expect(find.text('Use QBank practice to answer questions. Daily Study does not reveal answers.'), findsOneWidget);
    final questionSheet = find.byType(BottomSheet);
    expect(questionSheet, findsOneWidget);
    Navigator.of(tester.element(questionSheet)).pop();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Open').last);
    await tester.pumpAndSettle();
    expect(find.text('Safe video title'), findsWidgets);
    expect(find.text('Video playback is available from the learning video flow.'), findsOneWidget);
  });
}

Future<void> _pumpScreen(WidgetTester tester, _ScreenDailyStudyApi api) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [learningApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: DailyStudyScreen()),
    ),
  );
  await tester.pump();
  await tester.pump();
}

double _textPosition(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text)).dy;

class _ScreenDailyStudyApi extends LearningApiService {
  final DailyStudyModule module;
  final DailyStudyModule? mutationResult;
  final Completer<DailyStudyModule>? pendingMutation;
  final List<String> requestedDates = <String>[];
  final List<(String, DailyStudyTaskStatus)> mutations =
      <(String, DailyStudyTaskStatus)>[];

  _ScreenDailyStudyApi({
    required this.module,
    this.mutationResult,
    this.pendingMutation,
  }) : super(Dio());

  @override
  Future<DailyStudyModule> dailyStudy(String date) async {
    requestedDates.add(date);
    return module;
  }

  @override
  Future<DailyStudyModule> updateDailyStudyTaskStatus(
    String taskId,
    DailyStudyTaskStatus status,
  ) async {
    mutations.add((taskId, status));
    if (pendingMutation != null) {
      return pendingMutation!.future;
    }
    return mutationResult ?? module;
  }
}

DailyStudyProgress _progress({int total = 0, int finished = 0, int percent = 0}) =>
    DailyStudyProgress(
      totalTasks: total,
      pendingTasks: total - finished,
      inProgressTasks: 0,
      completedTasks: finished,
      skippedTasks: 0,
      finishedTasks: finished,
      completionPercent: percent,
    );

DailyStudyModule _module({
  DailyStudyProgress? progress,
  List<DailyStudySubject> subjects = const <DailyStudySubject>[],
}) =>
    DailyStudyModule(
      id: 'module-1',
      studyDate: '2026-09-10',
      status: 'IN_PROGRESS',
      generatedAt: null,
      startedAt: null,
      completedAt: null,
      progress: progress ?? _progress(),
      subjects: subjects,
    );

DailyStudySubject _subject(
  String slug,
  DailyStudyProgress progress, {
  List<DailyStudyTask> tasks = const <DailyStudyTask>[],
}) =>
    DailyStudySubject(
      id: '$slug-id',
      name: switch (slug) {
        'physics' => 'Physics',
        'chemistry' => 'Chemistry',
        _ => 'Biology',
      },
      slug: slug,
      progress: progress,
      tasks: tasks,
    );

DailyStudyTask _task(
  String id,
  DailyStudyTaskStatus status, {
  DailyStudyTaskType type = DailyStudyTaskType.question,
}) =>
    DailyStudyTask(
      id: id,
      type: type,
      status: status,
      displayOrder: 1,
      hierarchy: const DailyStudyHierarchy(),
      available: true,
      content: switch (type) {
        DailyStudyTaskType.question => const DailyStudyQuestionContent(
            id: 'question-1',
            stem: 'Safe question stem',
            type: 'SINGLE_CORRECT_MCQ',
            difficulty: 'MEDIUM',
            tags: <String>[],
            options: <DailyStudyQuestionOption>[
              DailyStudyQuestionOption(id: 'option-1', position: 1, text: 'Option one'),
            ],
          ),
        DailyStudyTaskType.video => const DailyStudyVideoContent(
            id: 'video-1',
            title: 'Safe video title',
          ),
        _ => null,
      },
    );
