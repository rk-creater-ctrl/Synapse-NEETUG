import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/daily_study_models.dart';
import '../providers/learning_providers.dart';

class DailyStudyScreen extends ConsumerStatefulWidget {
  const DailyStudyScreen({super.key});

  @override
  ConsumerState<DailyStudyScreen> createState() => _DailyStudyScreenState();
}

class _DailyStudyScreenState extends ConsumerState<DailyStudyScreen> {
  late final String _date = _localDate(DateTime.now());
  final Set<String> _mutatingTaskIds = <String>{};

  Future<void> _updateTask(DailyStudyTask task, DailyStudyTaskStatus status) async {
    if (_mutatingTaskIds.contains(task.id)) {
      return;
    }
    setState(() => _mutatingTaskIds.add(task.id));
    try {
      await ref.read(dailyStudyProvider(_date).notifier).updateTaskStatus(task.id, status);
    } on DioException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to update this task. Please try again.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to update this task. Please try again.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _mutatingTaskIds.remove(task.id));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(dailyStudyProvider(_date));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Daily Study'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.read(dailyStudyProvider(_date).notifier).load(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () => ref.read(dailyStudyProvider(_date).notifier).load(),
            child: const Text('Unable to load Daily Study. Retry'),
          ),
        ),
        data: _moduleBody,
      ),
    );
  }

  Widget _moduleBody(DailyStudyModule module) {
    final subjectBySlug = {for (final subject in module.subjects) subject.slug: subject};
    return RefreshIndicator(
      onRefresh: () => ref.read(dailyStudyProvider(_date).notifier).load(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _summaryCard(module),
          const SizedBox(height: 12),
          if (module.progress.totalTasks == 0)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text('No Daily Study tasks are available for this date.'),
            ),
          for (final slug in const ['physics', 'chemistry', 'biology']) ...[
            _subjectSection(subjectBySlug[slug], _subjectLabel(slug)),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }

  Widget _summaryCard(DailyStudyModule module) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(module.studyDate, style: const TextStyle(fontWeight: FontWeight.bold)),
              Text('Status: ${_statusLabel(module.status)}'),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: module.progress.completionPercent / 100),
              const SizedBox(height: 8),
              Text('${module.progress.finishedTasks} / ${module.progress.totalTasks} tasks finished · ${module.progress.completionPercent}%'),
              if (module.status == 'COMPLETED')
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Daily module completed'),
                ),
            ],
          ),
        ),
      );

  Widget _subjectSection(DailyStudySubject? subject, String label) {
    final progress = subject?.progress ?? DailyStudyProgress.empty;
    final tasks = subject?.tasks ?? const <DailyStudyTask>[];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(subject?.name.isNotEmpty == true ? subject!.name : label,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            LinearProgressIndicator(value: progress.completionPercent / 100),
            const SizedBox(height: 6),
            Text('${progress.finishedTasks} / ${progress.totalTasks} finished · ${progress.completionPercent}%'),
            if (tasks.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text('No Daily Study tasks are available for this subject.'),
              )
            else ...[
              const SizedBox(height: 8),
              ...tasks.map(_taskCard),
            ],
          ],
        ),
      ),
    );
  }

  Widget _taskCard(DailyStudyTask task) {
    final busy = _mutatingTaskIds.contains(task.id);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(task.type.label, style: const TextStyle(fontWeight: FontWeight.bold))),
                Text(_statusLabel(task.status.wireValue)),
              ],
            ),
            if (task.hierarchy.label.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(task.hierarchy.label),
            ],
            const SizedBox(height: 4),
            if (!task.available)
              const Text('This task is no longer available.')
            else
              Text(_taskPreview(task)),
            if (task.available)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => _showContent(task),
                  child: const Text('Open'),
                ),
              ),
            if (!task.status.isTerminal)
              Wrap(
                spacing: 8,
                children: [
                  if (task.status == DailyStudyTaskStatus.pending)
                    TextButton(
                      onPressed: busy ? null : () => _updateTask(task, DailyStudyTaskStatus.inProgress),
                      child: const Text('Start'),
                    ),
                  FilledButton(
                    onPressed: busy ? null : () => _updateTask(task, DailyStudyTaskStatus.completed),
                    child: Text(busy ? 'Saving...' : 'Complete'),
                  ),
                  TextButton(
                    onPressed: busy ? null : () => _updateTask(task, DailyStudyTaskStatus.skipped),
                    child: const Text('Skip'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  String _taskPreview(DailyStudyTask task) => switch (task.content) {
        DailyStudyQuestionContent question => question.stem,
        DailyStudyFlashcardContent card => card.title.isEmpty ? card.frontContent : card.title,
        DailyStudyRevisionContent revision => revision.title,
        DailyStudyVideoContent video => video.title,
        _ => 'Learning content',
      };

  Future<void> _showContent(DailyStudyTask task) async {
    final content = task.content;
    if (content == null) {
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: SingleChildScrollView(child: _contentBody(content)),
        ),
      ),
    );
  }

  Widget _contentBody(DailyStudyContent content) => switch (content) {
        DailyStudyQuestionContent question => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(question.stem, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              ...question.options.map((option) => ListTile(
                    leading: Text('${option.position}.'),
                    title: Text(option.text),
                  )),
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Use QBank practice to answer questions. Daily Study does not reveal answers.'),
              ),
            ],
          ),
        DailyStudyFlashcardContent card => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (card.title.isNotEmpty) Text(card.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              const Text('Front', style: TextStyle(fontWeight: FontWeight.bold)),
              Text(card.frontContent),
              const SizedBox(height: 12),
              const Text('Back', style: TextStyle(fontWeight: FontWeight.bold)),
              Text(card.backContent),
              if (card.explanation?.isNotEmpty == true) ...[
                const SizedBox(height: 12),
                const Text('Explanation', style: TextStyle(fontWeight: FontWeight.bold)),
                Text(card.explanation!),
              ],
            ],
          ),
        DailyStudyRevisionContent revision => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(revision.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              if (revision.type.isNotEmpty) Text(revision.type),
              const SizedBox(height: 12),
              Text(revision.content),
            ],
          ),
        DailyStudyVideoContent video => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(video.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              if (video.instructorName?.isNotEmpty == true) Text(video.instructorName!),
              if (video.durationSeconds != null) Text('${video.durationSeconds} seconds'),
              if (video.description?.isNotEmpty == true) ...[
                const SizedBox(height: 12),
                Text(video.description!),
              ],
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text('Video playback is available from the learning video flow.'),
              ),
            ],
          ),
        _ => const SizedBox.shrink(),
      };
}

String _localDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

String _subjectLabel(String slug) => switch (slug) {
      'physics' => 'Physics',
      'chemistry' => 'Chemistry',
      'biology' => 'Biology',
      _ => slug,
    };

String _statusLabel(String value) => value.replaceAll('_', ' ');
