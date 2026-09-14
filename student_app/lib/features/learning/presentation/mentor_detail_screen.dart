import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/mentor_discovery_models.dart';
import '../providers/learning_providers.dart';

const _days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

class MentorDetailScreen extends ConsumerWidget {
  final String mentorId;

  const MentorDetailScreen({super.key, required this.mentorId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(mentorDetailProvider(mentorId));
    return Scaffold(
      appBar: AppBar(title: const Text('Mentor details')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () => ref.invalidate(mentorDetailProvider(mentorId)),
            child: const Text('Mentor is unavailable. Retry'),
          ),
        ),
        data: (mentor) => _body(context, mentor),
      ),
    );
  }

  Widget _body(BuildContext context, StudentMentorDetail mentor) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(mentor.fullName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          if (mentor.headline?.isNotEmpty == true) ...[
            const SizedBox(height: 4),
            Text(mentor.headline!),
          ],
          const SizedBox(height: 12),
          Text('${mentor.experienceYears} years of experience'),
          if (mentor.bio?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            const Text('About', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Text(mentor.bio!),
          ],
          const SizedBox(height: 16),
          const Text('Subjects', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text(mentor.subjects.isEmpty
              ? 'No subject expertise is listed.'
              : mentor.subjects.map((subject) => subject.name).join(', ')),
          const SizedBox(height: 20),
          const Text('Recurring weekly availability', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('Times shown in ${mentor.timezone}.'),
          const SizedBox(height: 8),
          if (mentor.availability.isEmpty)
            const Text('This mentor has not shared recurring availability.')
          else
            ..._availabilityRows(mentor.availability),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => context.push('/mentors/${mentor.id}/book'),
            child: const Text('Book 15-minute session'),
          ),
        ],
      );

  List<Widget> _availabilityRows(List<MentorAvailabilityWindow> slots) {
    final grouped = <int, List<MentorAvailabilityWindow>>{};
    for (final slot in slots) {
      grouped.putIfAbsent(slot.dayOfWeek, () => []).add(slot);
    }
    final entries = grouped.entries.toList()..sort((left, right) => left.key.compareTo(right.key));
    return entries.map((entry) {
      final ordered = [...entry.value]
        ..sort((left, right) {
          final startCompare = left.startMinute.compareTo(right.startMinute);
          if (startCompare != 0) return startCompare;
          return left.endMinute.compareTo(right.endMinute);
        });
      final day = entry.key >= 0 && entry.key < _days.length ? _days[entry.key] : 'Day ${entry.key}';
      return Card(
        child: ListTile(
          title: Text(day),
          subtitle: Text(ordered.map((slot) => '${_time(slot.startMinute)}–${_time(slot.endMinute)}').join(', ')),
        ),
      );
    }).toList();
  }

  String _time(int minute) {
    final hours = minute ~/ 60;
    final minutes = minute % 60;
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}';
  }
}
