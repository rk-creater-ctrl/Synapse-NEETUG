import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/test_models.dart';
import '../providers/learning_providers.dart';

class TestsScreen extends ConsumerStatefulWidget {
  const TestsScreen({super.key});

  @override
  ConsumerState<TestsScreen> createState() => _TestsScreenState();
}

class _TestsScreenState extends ConsumerState<TestsScreen> {
  int _page = 1;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studentTestsProvider(_page));
    return Scaffold(
      appBar: AppBar(title: const Text('Tests')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(studentTestsProvider(_page));
        },
        child: state.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => ListView(
            children: [
              Center(
                child: TextButton(
                  onPressed: () => ref.invalidate(studentTestsProvider(_page)),
                  child: const Text('Unable to load tests. Retry'),
                ),
              ),
            ],
          ),
          data: (data) {
            final totalPages = data.totalPages == 0 ? 1 : data.totalPages;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (data.items.isEmpty)
                  const Center(child: Text('No tests are currently available.')),
                ...data.items.map(
                  (test) => Card(
                    child: ListTile(
                      title: Text(test.title),
                      subtitle: Text(
                        '${test.durationMinutes} min · ${test.totalMarks} marks',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push('/tests/${test.id}'),
                    ),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: _page <= 1
                          ? null
                          : () {
                              setState(() {
                                _page--;
                              });
                            },
                      child: const Text('Previous'),
                    ),
                    Text('Page $_page of $totalPages'),
                    TextButton(
                      onPressed: _page >= totalPages
                          ? null
                          : () {
                              setState(() {
                                _page++;
                              });
                            },
                      child: const Text('Next'),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class TestDetailScreen extends ConsumerStatefulWidget {
  final String testId;

  const TestDetailScreen({super.key, required this.testId});

  @override
  ConsumerState<TestDetailScreen> createState() => _TestDetailScreenState();
}

class _TestDetailScreenState extends ConsumerState<TestDetailScreen> {
  bool _starting = false;
  String? _error;

  Future<void> _start() async {
    if (_starting) {
      return;
    }
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final attemptId =
          await ref.read(learningApiProvider).startTestAttempt(widget.testId);
      if (mounted) {
        context.go('/test-attempts/$attemptId');
      }
    } on DioException catch (exception) {
      final body = exception.response?.data;
      final message = body is Map && body['code'] == 'TEST_RETAKE_NOT_AVAILABLE'
          ? 'A finalized attempt already exists for this test.'
          : 'Unable to start this test.';
      if (mounted) {
        setState(() {
          _error = message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Unable to start this test.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _starting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studentTestDetailProvider(widget.testId));
    return Scaffold(
      appBar: AppBar(title: const Text('Test instructions')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () =>
                ref.invalidate(studentTestDetailProvider(widget.testId)),
            child: const Text('Unable to load test. Retry'),
          ),
        ),
        data: (test) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(test.title, style: Theme.of(context).textTheme.headlineSmall),
            if (test.description != null) Text(test.description!),
            const SizedBox(height: 12),
            Text('${test.durationMinutes} minutes · ${test.totalMarks} marks'),
            Text('${test.totalQuestionCount} questions'),
            if (test.instructions != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(test.instructions!),
              ),
            ...test.sections.map(
              (section) => Card(
                child: ListTile(
                  title: Text(section.title),
                  subtitle: Text('${section.questionCount} questions'),
                ),
              ),
            ),
            if (_error != null) Text(_error!),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _starting ? null : _start,
              child: Text(_starting ? 'Starting…' : 'Start test'),
            ),
          ],
        ),
      ),
    );
  }
}

class TestAttemptScreen extends ConsumerStatefulWidget {
  final String attemptId;

  const TestAttemptScreen({super.key, required this.attemptId});

  @override
  ConsumerState<TestAttemptScreen> createState() => _TestAttemptScreenState();
}

class _TestAttemptScreenState extends ConsumerState<TestAttemptScreen>
    with WidgetsBindingObserver {
  Timer? _timer;
  int _questionIndex = 0;
  bool _saving = false;
  bool _submitting = false;
  bool _deadlineHandled = false;
  Duration _remaining = Duration.zero;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _tick();
    }
  }

  void _tick() {
    final attempt =
        ref.read(formalTestAttemptProvider(widget.attemptId)).valueOrNull;
    if (attempt == null) {
      return;
    }
    final next = remainingUntil(attempt.deadlineAt, DateTime.now());
    if (mounted) {
      setState(() {
        _remaining = next;
      });
    }
    if (next == Duration.zero && !_deadlineHandled) {
      _deadlineHandled = true;
      _handleDeadline();
    }
  }

  Future<void> _handleDeadline() async {
    try {
      await ref.read(learningApiProvider).testAttempt(widget.attemptId);
    } catch (_) {
      // The result endpoint is the authoritative finalized-state read.
    }
    if (mounted) {
      context.go('/test-attempts/${widget.attemptId}/result');
    }
  }

  Future<void> _saveAnswer(
    ActiveTestQuestion question,
    String? optionId,
    bool markForReview,
  ) async {
    if (_saving) {
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(learningApiProvider).saveTestAnswer(
            widget.attemptId,
            question.id,
            selectedOptionId: optionId,
            markForReview: markForReview,
          );
      ref.invalidate(formalTestAttemptProvider(widget.attemptId));
    } on DioException catch (exception) {
      final body = exception.response?.data;
      if (mounted && body is Map && body['code'] == 'TEST_ATTEMPT_AUTO_SUBMITTED') {
        context.go('/test-attempts/${widget.attemptId}/result');
      } else if (mounted) {
        setState(() {
          _error = 'Unable to save this answer.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Future<void> _submit() async {
    if (_submitting) {
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Submit test?'),
        content: const Text('Answers cannot be changed after submission.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      return;
    }
    setState(() {
      _submitting = true;
    });
    try {
      await ref.read(learningApiProvider).submitTestAttempt(widget.attemptId);
    } catch (_) {
      // A finalized attempt is handled by the result endpoint.
    }
    if (mounted) {
      context.go('/test-attempts/${widget.attemptId}/result');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(formalTestAttemptProvider(widget.attemptId));
    return Scaffold(
      appBar: AppBar(title: Text('Test · ${_clock(_remaining)}')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () =>
                ref.invalidate(formalTestAttemptProvider(widget.attemptId)),
            child: const Text('Unable to load attempt. Retry'),
          ),
        ),
        data: _attemptBody,
      ),
    );
  }

  Widget _attemptBody(FormalTestAttempt attempt) {
    final questions = attempt.sections
        .expand((section) => section.questions)
        .toList(growable: false);
    if (questions.isEmpty) {
      return const Center(child: Text('This attempt has no questions.'));
    }
    final activeIndex = _questionIndex < 0
        ? 0
        : _questionIndex >= questions.length
            ? questions.length - 1
            : _questionIndex;
    final current = questions[activeIndex];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          '${attempt.testTitle} · Question ${activeIndex + 1}/${questions.length}',
        ),
        _sectionNavigation(attempt.sections, activeIndex),
        if (_error != null) Text(_error!),
        const SizedBox(height: 12),
        Text(
          current.stem,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        RadioGroup<String>(
          groupValue: current.selectedOptionId,
          onChanged: (value) {
            if (!_saving) {
              _saveAnswer(current, value, current.isMarkedForReview);
            }
          },
          child: Column(
            children: current.options
                .map(
                  (option) => RadioListTile<String>(
                    value: option.id,
                    enabled: !_saving,
                    title: Text('${option.position}. ${option.text}'),
                  ),
                )
                .toList(growable: false),
          ),
        ),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton(
              onPressed: _saving
                  ? null
                  : () => _saveAnswer(current, null, current.isMarkedForReview),
              child: const Text('Clear answer'),
            ),
            OutlinedButton(
              onPressed: _saving
                  ? null
                  : () => _saveAnswer(
                        current,
                        current.selectedOptionId,
                        !current.isMarkedForReview,
                      ),
              child: Text(
                current.isMarkedForReview ? 'Unmark review' : 'Mark for review',
              ),
            ),
          ],
        ),
        Wrap(
          spacing: 6,
          children: List.generate(
            questions.length,
            (itemIndex) => OutlinedButton(
              onPressed: () {
                setState(() {
                  _questionIndex = itemIndex;
                });
              },
              child: Text(
                '${itemIndex + 1}${questions[itemIndex].isMarkedForReview ? ' •' : ''}',
              ),
            ),
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            TextButton(
              onPressed: activeIndex == 0
                  ? null
                  : () {
                      setState(() {
                        _questionIndex = activeIndex - 1;
                      });
                    },
              child: const Text('Previous'),
            ),
            TextButton(
              onPressed: activeIndex + 1 >= questions.length
                  ? null
                  : () {
                      setState(() {
                        _questionIndex = activeIndex + 1;
                      });
                    },
              child: const Text('Next'),
            ),
          ],
        ),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: Text(_submitting ? 'Submitting…' : 'Submit test'),
        ),
      ],
    );
  }

  Widget _sectionNavigation(List<ActiveTestSection> sections, int activeIndex) {
    var offset = 0;
    final children = <Widget>[];
    for (final section in sections) {
      final start = offset;
      final end = start + section.questions.length;
      children.add(
        ChoiceChip(
          label: Text(section.title),
          selected: activeIndex >= start && activeIndex < end,
          onSelected: section.questions.isEmpty
              ? null
              : (_) {
                  setState(() {
                    _questionIndex = start;
                  });
                },
        ),
      );
      offset = end;
    }
    return Wrap(spacing: 8, children: children);
  }

  String _clock(Duration value) {
    final hours = value.inHours.toString().padLeft(2, '0');
    final minutes = value.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = value.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$hours:$minutes:$seconds';
  }
}

class TestResultScreen extends ConsumerWidget {
  final String attemptId;

  const TestResultScreen({super.key, required this.attemptId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(testResultProvider(attemptId));
    return Scaffold(
      appBar: AppBar(title: const Text('Test result')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () => ref.invalidate(testResultProvider(attemptId)),
            child: const Text('Result is not available yet. Retry'),
          ),
        ),
        data: (result) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              result.testTitle,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text('Score: ${result.score} / ${result.totalMarks}'),
            Text('Correct: ${result.correctCount}'),
            Text('Incorrect: ${result.incorrectCount}'),
            Text('Unanswered: ${result.unansweredCount}'),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => context.push('/test-attempts/$attemptId/review'),
              child: const Text('Review answers'),
            ),
          ],
        ),
      ),
    );
  }
}

class TestReviewScreen extends ConsumerWidget {
  final String attemptId;

  const TestReviewScreen({super.key, required this.attemptId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(testReviewProvider(attemptId));
    return Scaffold(
      appBar: AppBar(title: const Text('Review answers')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () => ref.invalidate(testReviewProvider(attemptId)),
            child: const Text('Unable to load review. Retry'),
          ),
        ),
        data: (review) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final section in review.sections) ...[
              Text(section.title, style: Theme.of(context).textTheme.titleLarge),
              for (final question in section.questions)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          question.stem,
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        for (final option in question.reviewOptions)
                          Text(
                            '${option.position}. ${option.text}'
                            '${option.id == question.selectedOptionId ? ' (your answer)' : ''}'
                            '${option.isCorrect ? ' (correct)' : ''}',
                          ),
                        Text(
                          question.answered
                              ? question.isCorrect == true
                                  ? 'Correct'
                                  : 'Incorrect'
                              : 'Unanswered',
                        ),
                        Text('Marks: ${question.awardedMarks ?? 0}'),
                        if (question.explanation != null)
                          Text(question.explanation!),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
