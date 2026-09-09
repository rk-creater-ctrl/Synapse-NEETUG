import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/learning_models.dart';
import '../providers/learning_providers.dart';

class QbankHistoryScreen extends ConsumerStatefulWidget {
  const QbankHistoryScreen({super.key});

  @override
  ConsumerState<QbankHistoryScreen> createState() => _QbankHistoryScreenState();
}

class _QbankHistoryScreenState extends ConsumerState<QbankHistoryScreen> {
  int _page = 1;

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(practiceHistoryProvider(_page));
    return Scaffold(
      appBar: AppBar(title: const Text('Practice history')),
      body: history.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () => ref.invalidate(practiceHistoryProvider(_page)),
            child: const Text('Unable to load history. Retry'),
          ),
        ),
        data: (page) {
          if (page.items.isEmpty) {
            return const Center(child: Text('No QBank practice sessions yet.'));
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              ...page.items.map((session) => _historyCard(context, session)),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: _page <= 1 ? null : () => setState(() => _page -= 1),
                    child: const Text('Previous'),
                  ),
                  Text('Page $_page of ${page.totalPages == 0 ? 1 : page.totalPages}'),
                  TextButton(
                    onPressed: _page >= page.totalPages ? null : () => setState(() => _page += 1),
                    child: const Text('Next'),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _historyCard(BuildContext context, PracticeSession session) {
    final summary = session.summary;
    final date = session.startedAt?.toLocal().toString() ?? 'Unknown date';
    return Card(
      child: ListTile(
        title: Text(session.status.replaceAll('_', ' ')),
        subtitle: Text(
          '$date\n${summary.totalQuestions} questions · '
          '${summary.answeredQuestions} answered · ${summary.correctAnswers} correct',
        ),
        isThreeLine: true,
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/qbank/session/${session.id}'),
      ),
    );
  }
}
