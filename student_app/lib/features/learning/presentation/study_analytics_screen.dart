import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/study_analytics_models.dart';
import '../providers/learning_providers.dart';

class StudyAnalyticsScreen extends ConsumerWidget {
  const StudyAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studyAnalyticsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Study Analytics'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(studyAnalyticsProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () => ref.invalidate(studyAnalyticsProvider),
            child: const Text('Unable to load study analytics. Retry'),
          ),
        ),
        data: (analytics) => _body(analytics, ref),
      ),
    );
  }

  Widget _body(StudyAnalytics analytics, WidgetRef ref) => RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(studyAnalyticsProvider);
          await ref.read(studyAnalyticsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _periodGrid(analytics),
            if (analytics.allTime.sessionCount == 0)
              const Padding(
                padding: EdgeInsets.only(top: 16),
                child: Text('No completed study sessions yet.'),
              ),
            const SizedBox(height: 20),
            const Text('Last 7 days', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ...analytics.recentDays.map(
              (day) => ListTile(
                title: Text(day.date),
                trailing: Text('${_duration(day.totalSeconds)} · ${day.sessionCount} sessions'),
              ),
            ),
            const SizedBox(height: 12),
            const Text('By subject', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            if (analytics.bySubject.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('No subject-specific completed study time yet.'),
              ),
            ...analytics.bySubject.map(
              (subject) => _breakdownTile(
                subject.subjectName,
                subject.totalSeconds,
                subject.sessionCount,
              ),
            ),
            const SizedBox(height: 12),
            const Text('By activity', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            if (analytics.byContextType.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('No completed study time yet.'),
              ),
            ...analytics.byContextType.map(
              (context) => _breakdownTile(
                _contextLabel(context.contextType),
                context.totalSeconds,
                context.sessionCount,
              ),
            ),
          ],
        ),
      );

  Widget _periodGrid(StudyAnalytics analytics) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          _periodCard('Today', analytics.today),
          _periodCard('This week', analytics.week),
          _periodCard('This month', analytics.month),
          _periodCard('All time', analytics.allTime),
        ],
      );

  Widget _periodCard(String label, StudyAnalyticsPeriod period) => SizedBox(
        width: 170,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(_duration(period.totalSeconds)),
                Text('${period.sessionCount} completed sessions'),
              ],
            ),
          ),
        ),
      );

  Widget _breakdownTile(String title, int seconds, int sessions) => ListTile(
        title: Text(title),
        trailing: Text('${_duration(seconds)} · $sessions sessions'),
      );
}

String _duration(int totalSeconds) {
  final hours = totalSeconds ~/ 3600;
  final minutes = (totalSeconds % 3600) ~/ 60;
  if (hours > 0) {
    return '${hours}h ${minutes}m';
  }
  return '${minutes}m';
}

String _contextLabel(String value) => value.replaceAll('_', ' ');
