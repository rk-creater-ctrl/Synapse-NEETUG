import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/learning_models.dart';
import '../providers/learning_providers.dart';

class QbankBrowseScreen extends ConsumerStatefulWidget {
  const QbankBrowseScreen({super.key});

  @override
  ConsumerState<QbankBrowseScreen> createState() => _QbankBrowseScreenState();
}

class _QbankBrowseScreenState extends ConsumerState<QbankBrowseScreen> {
  QuestionFilters _filters = const QuestionFilters();
  int _questionCount = 20;
  bool _creating = false;
  String? _actionError;

  final _year = TextEditingController();
  final _tag = TextEditingController();
  final _exam = TextEditingController();
  final _subject = TextEditingController();
  final _classId = TextEditingController();
  final _chapter = TextEditingController();
  final _topic = TextEditingController();
  final _subtopic = TextEditingController();

  @override
  void dispose() {
    _year.dispose();
    _tag.dispose();
    _exam.dispose();
    _subject.dispose();
    _classId.dispose();
    _chapter.dispose();
    _topic.dispose();
    _subtopic.dispose();
    super.dispose();
  }

  void _applyFilters({int page = 1}) {
    setState(() {
      _filters = QuestionFilters(
        page: page,
        limit: _filters.limit,
        examId: _exam.text.trim().isEmpty ? null : _exam.text.trim(),
        subjectId: _subject.text.trim().isEmpty ? null : _subject.text.trim(),
        classId: _classId.text.trim().isEmpty ? null : _classId.text.trim(),
        chapterId: _chapter.text.trim().isEmpty ? null : _chapter.text.trim(),
        topicId: _topic.text.trim().isEmpty ? null : _topic.text.trim(),
        subtopicId: _subtopic.text.trim().isEmpty ? null : _subtopic.text.trim(),
        pyqOnly: _filters.pyqOnly,
        pyqYear: int.tryParse(_year.text.trim()),
        difficulty: _filters.difficulty,
        tag: _tag.text.trim().isEmpty ? null : _tag.text.trim(),
      );
      _actionError = null;
    });
  }

  void _replaceBrowseFilters({bool? pyqOnly, String? difficulty}) {
    setState(() {
      _filters = QuestionFilters(
        page: 1,
        limit: _filters.limit,
        examId: _filters.examId,
        subjectId: _filters.subjectId,
        classId: _filters.classId,
        chapterId: _filters.chapterId,
        topicId: _filters.topicId,
        subtopicId: _filters.subtopicId,
        pyqOnly: pyqOnly ?? _filters.pyqOnly,
        pyqYear: _filters.pyqYear,
        difficulty: difficulty,
        tag: _filters.tag,
      );
    });
  }

  Future<void> _startPractice() async {
    if (_creating) return;
    setState(() {
      _creating = true;
      _actionError = null;
    });
    try {
      final session = await ref.read(learningApiProvider).createPracticeSession(
            _filters,
            questionCount: _questionCount,
          );
      if (!mounted) return;
      if (session.summary.totalQuestions == 0) {
        setState(() {
          _actionError = 'No questions match these filters. Try changing the filters.';
        });
        return;
      }
      context.push('/qbank/session/${session.id}');
    } on DioException catch (error) {
      final data = error.response?.data;
      final code = data is Map ? data['code']?.toString() : null;
      if (mounted) {
        setState(() {
          _actionError = code == 'QUESTION_NOT_AVAILABLE'
              ? 'Questions changed before the session could start. Please try again.'
              : 'Unable to start a practice session.';
        });
      }
    } catch (_) {
      if (mounted) setState(() => _actionError = 'Unable to start a practice session.');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final questions = ref.watch(questionPageProvider(_filters));
    return Scaffold(
      appBar: AppBar(
        title: const Text('QBank & PYQs'),
        actions: [
          IconButton(
            tooltip: 'Practice history',
            onPressed: () => context.push('/qbank/history'),
            icon: const Icon(Icons.history),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _filtersCard(),
          const SizedBox(height: 12),
          _practiceCard(),
          if (_actionError != null) Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(_actionError!),
          ),
          const SizedBox(height: 16),
          questions.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => const Text('Unable to load questions. Please try again.'),
            data: _questionList,
          ),
        ],
      ),
    );
  }

  Widget _filtersCard() => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Browse filters', style: TextStyle(fontWeight: FontWeight.bold)),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('PYQ only'),
                value: _filters.pyqOnly ?? false,
                onChanged: (value) => _replaceBrowseFilters(
                  pyqOnly: value,
                  difficulty: _filters.difficulty,
                ),
              ),
              DropdownButtonFormField<String>(
                key: ValueKey(_filters.difficulty ?? ''),
                initialValue: _filters.difficulty ?? '',
                decoration: const InputDecoration(labelText: 'Difficulty'),
                items: const [
                  DropdownMenuItem(value: '', child: Text('Any difficulty')),
                  DropdownMenuItem(value: 'EASY', child: Text('Easy')),
                  DropdownMenuItem(value: 'MEDIUM', child: Text('Medium')),
                  DropdownMenuItem(value: 'HARD', child: Text('Hard')),
                ],
                onChanged: (value) => _replaceBrowseFilters(
                  difficulty: value == null || value.isEmpty ? null : value,
                ),
              ),
              TextField(controller: _year, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'PYQ year (optional)')),
              TextField(controller: _tag, decoration: const InputDecoration(labelText: 'Tag (optional)')),
              ExpansionTile(
                title: const Text('Hierarchy IDs (optional)'),
                subtitle: const Text('Use IDs from the academic path you are browsing.'),
                children: [
                  TextField(controller: _exam, decoration: const InputDecoration(labelText: 'Exam ID')),
                  TextField(controller: _subject, decoration: const InputDecoration(labelText: 'Subject ID')),
                  TextField(controller: _classId, decoration: const InputDecoration(labelText: 'Class ID')),
                  TextField(controller: _chapter, decoration: const InputDecoration(labelText: 'Chapter ID')),
                  TextField(controller: _topic, decoration: const InputDecoration(labelText: 'Topic ID')),
                  TextField(controller: _subtopic, decoration: const InputDecoration(labelText: 'Subtopic ID')),
                ],
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: _applyFilters, child: const Text('Apply filters')),
              ),
            ],
          ),
        ),
      );

  Widget _practiceCard() => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  key: ValueKey(_questionCount),
                  initialValue: _questionCount,
                  decoration: const InputDecoration(labelText: 'Questions'),
                  items: const [10, 20, 50, 100]
                      .map((count) => DropdownMenuItem(value: count, child: Text('$count questions')))
                      .toList(),
                  onChanged: (value) => setState(() => _questionCount = value ?? 20),
                ),
              ),
              const SizedBox(width: 12),
              FilledButton(
                onPressed: _creating ? null : _startPractice,
                child: Text(_creating ? 'Starting…' : 'Start practice'),
              ),
            ],
          ),
        ),
      );

  Widget _questionList(QuestionPage page) {
    if (page.items.isEmpty) {
      return const Center(child: Padding(
        padding: EdgeInsets.all(24),
        child: Text('No questions are available for these filters.'),
      ));
    }
    return Column(
      children: [
        ...page.items.map((question) => Card(
              child: ListTile(
                title: Text(question.stem),
                subtitle: Text(_metadata(question)),
                onTap: () => context.push('/qbank/question/${question.id}'),
              ),
            )),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('${page.total} questions · page ${page.page} of ${page.totalPages == 0 ? 1 : page.totalPages}'),
            Row(children: [
              TextButton(
                onPressed: page.page <= 1 ? null : () => _applyFilters(page: page.page - 1),
                child: const Text('Previous'),
              ),
              TextButton(
                onPressed: page.page >= page.totalPages ? null : () => _applyFilters(page: page.page + 1),
                child: const Text('Next'),
              ),
            ]),
          ],
        ),
      ],
    );
  }

  String _metadata(StudentQuestion question) {
    final parts = <String>[question.sourceType, question.difficulty];
    if (question.pyqMetadata != null) {
      final pyq = question.pyqMetadata!;
      parts.add('${pyq.sourceExam} ${pyq.year} · Q${pyq.questionNumber}');
      if (pyq.sessionKey.isNotEmpty || pyq.paperKey.isNotEmpty) {
        parts.add('${pyq.sessionKey} / ${pyq.paperKey}');
      }
    }
    final hierarchy = [question.subjectName, question.chapterName, question.topicName]
        .whereType<String>()
        .where((name) => name.isNotEmpty)
        .join(' · ');
    if (hierarchy.isNotEmpty) parts.add(hierarchy);
    return parts.join(' · ');
  }
}
