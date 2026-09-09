import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/learning_models.dart';
import '../providers/learning_providers.dart';

class QbankPracticeScreen extends ConsumerStatefulWidget {
  final String sessionId;

  const QbankPracticeScreen({super.key, required this.sessionId});

  @override
  ConsumerState<QbankPracticeScreen> createState() => _QbankPracticeScreenState();
}

class _QbankPracticeScreenState extends ConsumerState<QbankPracticeScreen> {
  int _index = 0;
  String? _selectedOptionId;
  bool _submitting = false;
  bool _completing = false;
  String? _error;
  DateTime _openedAt = DateTime.now();
  PracticeSession? _completedSession;

  void _moveTo(int next, int length) {
    if (next < 0 || next >= length) return;
    setState(() {
      _index = next;
      _selectedOptionId = null;
      _error = null;
      _openedAt = DateTime.now();
    });
  }

  Future<void> _answer(PracticeItem item) async {
    final optionId = _selectedOptionId;
    if (optionId == null || _submitting || item.answered || item.unavailable) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(learningApiProvider).answerPracticeItem(
            widget.sessionId,
            item.id,
            selectedOptionId: optionId,
            timeSpentSeconds: DateTime.now().difference(_openedAt).inSeconds,
          );
      ref.invalidate(practiceSessionProvider(widget.sessionId));
      if (mounted) setState(() => _selectedOptionId = null);
    } on DioException catch (error) {
      final data = error.response?.data;
      final code = data is Map ? data['code']?.toString() : null;
      if (mounted) {
        setState(() {
          _error = code == 'PRACTICE_ITEM_ALREADY_ANSWERED'
              ? 'This question was already answered. Refreshing the session.'
              : code == 'PRACTICE_SESSION_NOT_IN_PROGRESS'
                  ? 'This practice session is already complete.'
                  : 'Unable to submit this answer.';
        });
        if (code == 'PRACTICE_ITEM_ALREADY_ANSWERED') {
          ref.invalidate(practiceSessionProvider(widget.sessionId));
        }
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to submit this answer.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _complete() async {
    if (_completing) return;
    setState(() {
      _completing = true;
      _error = null;
    });
    try {
      final session = await ref.read(learningApiProvider).completePracticeSession(widget.sessionId);
      ref.invalidate(practiceSessionProvider(widget.sessionId));
      if (mounted) setState(() => _completedSession = session);
    } on DioException catch (_) {
      if (mounted) setState(() => _error = 'Unable to complete this session.');
    } finally {
      if (mounted) setState(() => _completing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = _completedSession == null
        ? ref.watch(practiceSessionProvider(widget.sessionId))
        : AsyncData(_completedSession!);
    return Scaffold(
      appBar: AppBar(title: const Text('QBank practice')),
      body: session.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Unable to load this practice session.'),
            TextButton(
              onPressed: () => ref.invalidate(practiceSessionProvider(widget.sessionId)),
              child: const Text('Retry'),
            ),
          ]),
        ),
        data: _sessionBody,
      ),
    );
  }

  Widget _sessionBody(PracticeSession session) {
    if (session.status == 'COMPLETED' || _completedSession != null) {
      return _summary(session);
    }
    if (session.items.isEmpty) {
      return const Center(child: Text('This practice session has no questions.'));
    }
    final index = _index >= session.items.length ? session.items.length - 1 : _index;
    final item = session.items[index];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Question ${index + 1} / ${session.items.length}', style: const TextStyle(fontWeight: FontWeight.bold)),
        Text('${session.summary.answeredQuestions} answered · ${session.summary.unansweredQuestions} remaining'),
        const SizedBox(height: 12),
        if (_error != null) Text(_error!),
        _itemBody(item),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            TextButton(onPressed: index == 0 ? null : () => _moveTo(index - 1, session.items.length), child: const Text('Previous')),
            TextButton(onPressed: index + 1 >= session.items.length ? null : () => _moveTo(index + 1, session.items.length), child: const Text('Next')),
          ],
        ),
        FilledButton(
          onPressed: _completing ? null : _complete,
          child: Text(_completing ? 'Completing…' : 'Complete session'),
        ),
      ],
    );
  }

  Widget _itemBody(PracticeItem item) {
    if (item.unavailable || item.question == null) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('This question is no longer available. You can continue with other questions.'),
        ),
      );
    }
    final question = item.question!;
    final answer = item.answer;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(question.stem, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(_questionMetadata(question)),
            const SizedBox(height: 12),
            IgnorePointer(
              ignoring: answer != null || _submitting,
              child: RadioGroup<String>(
                groupValue: answer == null ? _selectedOptionId : answer.selectedOptionId,
                onChanged: (value) {
                  if (answer != null || _submitting) return;
                  setState(() => _selectedOptionId = value);
                },
                child: Column(
                  children: question.options
                      .map((option) => RadioListTile<String>(
                            value: option.id,
                            title: Text('${option.position}. ${option.text}'),
                          ))
                      .toList(),
                ),
              ),
            ),
            if (answer == null) ...[
              FilledButton(
                onPressed: _selectedOptionId == null || _submitting ? null : () => _answer(item),
                child: Text(_submitting ? 'Checking…' : 'Check answer'),
              ),
            ] else ...[
              const Divider(),
              Text(answer.isCorrect ? 'Correct' : 'Incorrect', style: const TextStyle(fontWeight: FontWeight.bold)),
              Text('Correct answer: ${_optionText(question, answer.correctOptionId)}'),
              const SizedBox(height: 8),
              Text(answer.explanation),
              if (answer.timeSpentSeconds != null) Text('Time spent: ${answer.timeSpentSeconds}s'),
            ],
          ],
        ),
      ),
    );
  }

  Widget _summary(PracticeSession session) {
    final summary = session.summary;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Session complete', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Text('Total: ${summary.totalQuestions}'),
        Text('Answered: ${summary.answeredQuestions}'),
        Text('Correct: ${summary.correctAnswers}'),
        Text('Incorrect: ${summary.incorrectAnswers}'),
        Text('Unanswered: ${summary.unansweredQuestions}'),
        Text('Accuracy: ${summary.accuracyPercentage.toStringAsFixed(1)}% of answered questions'),
        const SizedBox(height: 16),
        FilledButton(onPressed: () => context.go('/qbank/history'), child: const Text('View practice history')),
      ],
    );
  }

  String _optionText(StudentQuestion question, String id) {
    for (final option in question.options) {
      if (option.id == id) return option.text;
    }
    return 'Correct option';
  }

  String _questionMetadata(StudentQuestion question) {
    final values = <String>[question.sourceType, question.difficulty];
    final pyq = question.pyqMetadata;
    if (pyq != null) values.add('${pyq.sourceExam} ${pyq.year} · Q${pyq.questionNumber}');
    return values.join(' · ');
  }
}
