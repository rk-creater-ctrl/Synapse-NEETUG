import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/mentor_discovery_models.dart';
import '../providers/learning_providers.dart';

class MentorSessionsScreen extends ConsumerWidget {
  const MentorSessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(title: const Text('My mentor sessions'), bottom: const TabBar(tabs: [Tab(text: 'Upcoming'), Tab(text: 'History')])),
      body: const TabBarView(children: [_SessionList(scope: 'upcoming'), _SessionList(scope: 'past')]),
    ),
  );
}

class _SessionList extends ConsumerWidget {
  final String scope;
  const _SessionList({required this.scope});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(mentorBookingsProvider(scope));
    return state.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => Center(child: TextButton(onPressed: () => ref.invalidate(mentorBookingsProvider(scope)), child: const Text('Could not load sessions. Retry'))),
      data: (bookings) => RefreshIndicator(
        onRefresh: () async { ref.invalidate(mentorBookingsProvider(scope)); await ref.read(mentorBookingsProvider(scope).future); },
        child: bookings.isEmpty
          ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(scope == 'upcoming' ? 'No upcoming mentor sessions.' : 'No session history yet.'))])
          : ListView.builder(
              padding: const EdgeInsets.all(12), itemCount: bookings.length,
              itemBuilder: (_, index) => _card(context, bookings[index]),
            ),
      ),
    );
  }

  Widget _card(BuildContext context, MentorBooking booking) => Card(child: ListTile(
    title: Text(booking.mentor.fullName),
    subtitle: Text('${booking.localDate} ${booking.localStartTime} - ${booking.localEndTime}\n${booking.mentorTimezone}${booking.mentor.headline?.isNotEmpty == true ? '\n${booking.mentor.headline}' : ''}'),
    trailing: Text(booking.status),
    isThreeLine: booking.mentor.headline?.isNotEmpty == true,
    onTap: () => context.push('/mentor-sessions/${booking.id}'),
  ));
}
