import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/daily_study_models.dart';
import 'package:synapse_neetug/features/learning/data/learning_api_service.dart';
import 'package:synapse_neetug/features/learning/providers/learning_providers.dart';

void main() {
  test('loads the selected date and stores the server module', () async {
    final api = _RecordingDailyStudyApi(module: _module(completionPercent: 0));
    final controller = DailyStudyController(api, '2026-09-10');

    await controller.load();

    expect(api.requestedDates, ['2026-09-10']);
    expect(_successfulModule(controller).id, 'module-0');
    controller.dispose();
  });

  test('replaces state with the server response after a supported mutation', () async {
    final api = _RecordingDailyStudyApi(
      module: _module(completionPercent: 0),
      mutationResult: _module(completionPercent: 37),
    );
    final controller = DailyStudyController(api, '2026-09-10');
    await controller.load();

    await controller.updateTaskStatus(
      'task-physics-1',
      DailyStudyTaskStatus.inProgress,
    );

    expect(api.mutations, [
      ('task-physics-1', DailyStudyTaskStatus.inProgress),
    ]);
    expect(_successfulModule(controller).progress.completionPercent, 37);
    expect(api.requestedDates, hasLength(1));
    controller.dispose();
  });

  test('preserves the previous module when a mutation fails', () async {
    final api = _RecordingDailyStudyApi(
      module: _module(completionPercent: 50),
      mutationError: StateError('network failure'),
    );
    final controller = DailyStudyController(api, '2026-09-10');
    await controller.load();

    await expectLater(
      controller.updateTaskStatus('task-physics-1', DailyStudyTaskStatus.completed),
      throwsA(isA<StateError>()),
    );

    expect(_successfulModule(controller).progress.completionPercent, 50);
    expect(api.requestedDates, hasLength(1));
    controller.dispose();
  });

  test('accepts terminal status mutations but never sends PENDING', () async {
    final api = _RecordingDailyStudyApi(module: _module(completionPercent: 0));
    final controller = DailyStudyController(api, '2026-09-10');
    await controller.load();

    await controller.updateTaskStatus('task-physics-1', DailyStudyTaskStatus.skipped);
    await expectLater(
      controller.updateTaskStatus('task-physics-1', DailyStudyTaskStatus.pending),
      throwsA(isA<ArgumentError>()),
    );

    expect(api.mutations, [('task-physics-1', DailyStudyTaskStatus.skipped)]);
    controller.dispose();
  });
}

DailyStudyModule _successfulModule(DailyStudyController controller) {
  final state = controller.state;
  expect(state, isA<AsyncData<DailyStudyModule>>());
  return (state as AsyncData<DailyStudyModule>).value;
}

class _RecordingDailyStudyApi extends LearningApiService {
  final DailyStudyModule module;
  final DailyStudyModule? mutationResult;
  final Object? mutationError;
  final List<String> requestedDates = <String>[];
  final List<(String, DailyStudyTaskStatus)> mutations =
      <(String, DailyStudyTaskStatus)>[];

  _RecordingDailyStudyApi({
    required this.module,
    this.mutationResult,
    this.mutationError,
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
    if (mutationError != null) {
      throw mutationError!;
    }
    return mutationResult ?? module;
  }
}

DailyStudyModule _module({required int completionPercent}) => DailyStudyModule(
      id: 'module-$completionPercent',
      studyDate: '2026-09-10',
      status: 'IN_PROGRESS',
      generatedAt: null,
      startedAt: null,
      completedAt: null,
      progress: DailyStudyProgress(
        totalTasks: 1,
        pendingTasks: 1,
        inProgressTasks: 0,
        completedTasks: 0,
        skippedTasks: 0,
        finishedTasks: 0,
        completionPercent: completionPercent,
      ),
      subjects: const <DailyStudySubject>[],
    );
