import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/learning_models.dart';
import '../providers/learning_providers.dart';

class QbankQuestionDetailScreen extends ConsumerWidget {
  final String questionId;

  const QbankQuestionDetailScreen({super.key, required this.questionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Question preview')),
      body: FutureBuilder<StudentQuestion>(
        future: ref.read(learningApiProvider).question(questionId),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Center(child: Text('This question is unavailable.'));
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final question = snapshot.data!;
          final pyq = question.pyqMetadata;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(question.stem, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text('${question.sourceType} · ${question.difficulty}'),
              if (pyq != null) Text('${pyq.sourceExam} ${pyq.year} · ${pyq.sessionKey} / ${pyq.paperKey} · Q${pyq.questionNumber}'),
              const SizedBox(height: 12),
              ...question.options.map((option) => Card(
                    child: ListTile(title: Text('${option.position}. ${option.text}')),
                  )),
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text('Answers and explanations are available only in a practice session after you submit an answer.'),
              ),
            ],
          );
        },
      ),
    );
  }
}
