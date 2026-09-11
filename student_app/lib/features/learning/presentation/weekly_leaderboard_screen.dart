import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/study_leaderboard_models.dart';
import '../providers/learning_providers.dart';

class WeeklyLeaderboardScreen extends ConsumerWidget {
  const WeeklyLeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(weeklyStudyLeaderboardProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Weekly Leaderboard'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(weeklyStudyLeaderboardProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () => ref.invalidate(weeklyStudyLeaderboardProvider),
            child: const Text('Unable to load weekly leaderboard. Retry'),
          ),
        ),
        data: (leaderboard) => _body(leaderboard, ref),
      ),
    );
  }

  Widget _body(WeeklyStudyLeaderboard leaderboard, WidgetRef ref) {
    final currentOutsideTop = leaderboard.currentUser != null &&
        !leaderboard.entries.any(
          (entry) => entry.studentId == leaderboard.currentUser!.studentId,
        );
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(weeklyStudyLeaderboardProvider);
        await ref.read(weeklyStudyLeaderboardProvider.future);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            '${leaderboard.weekStart} – ${leaderboard.weekEnd}',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          if (leaderboard.entries.isEmpty)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text('No completed study sessions are on this week\'s leaderboard yet.'),
            ),
          ...leaderboard.entries.map(_entryTile),
          if (currentOutsideTop) ...[
            const Divider(height: 28),
            const Text('Your position', style: TextStyle(fontWeight: FontWeight.bold)),
            _entryTile(leaderboard.currentUser!),
          ],
        ],
      ),
    );
  }

  Widget _entryTile(DailyLeaderboardEntry entry) => ListTile(
        leading: Text('#${entry.rank}', style: const TextStyle(fontWeight: FontWeight.bold)),
        title: Text(entry.isCurrentUser ? '${entry.displayName} (You)' : entry.displayName),
        subtitle: Text('${_duration(entry.totalSeconds)} · ${entry.sessionCount} sessions'),
      );
}

String _duration(int totalSeconds) {
  final hours = totalSeconds ~/ 3600;
  final minutes = (totalSeconds % 3600) ~/ 60;
  if (hours > 0) {
    return '${hours}h ${minutes.toString().padLeft(2, '0')}m';
  }
  return '${minutes}m';
}
