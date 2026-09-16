import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/mentor_discovery_models.dart';
import '../providers/learning_providers.dart';

class MentorSessionDetailScreen extends ConsumerStatefulWidget {
  final String bookingId;
  const MentorSessionDetailScreen({super.key, required this.bookingId});
  @override
  ConsumerState<MentorSessionDetailScreen> createState() => _MentorSessionDetailScreenState();
}

class _MentorSessionDetailScreenState extends ConsumerState<MentorSessionDetailScreen> {
  MentorBooking? _updated;
  bool _cancelling = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(mentorBookingProvider(widget.bookingId));
    return Scaffold(
      appBar: AppBar(title: const Text('Mentor session')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(child: TextButton(onPressed: () => ref.invalidate(mentorBookingProvider(widget.bookingId)), child: const Text('Could not load session. Retry'))),
        data: (booking) => _body(_updated ?? booking),
      ),
    );
  }

  Widget _body(MentorBooking booking) => Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(booking.mentor.fullName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
    if (booking.mentor.headline?.isNotEmpty == true) Text(booking.mentor.headline!),
    const SizedBox(height: 16),
    Text('${booking.localDate} ${booking.localStartTime} - ${booking.localEndTime}'),
    Text('Times shown in ${booking.mentorTimezone}.'),
    Text('Status: ${booking.status}'),
    if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.red))),
    const SizedBox(height: 20),
    if (booking.status == 'CONFIRMED')
      FilledButton(onPressed: () => context.push('/mentor-sessions/${booking.id}/call'), child: const Text('Join Call')),
    if (booking.status == 'CONFIRMED') const SizedBox(height: 8),
    if (booking.status == 'PENDING' || booking.status == 'CONFIRMED')
      FilledButton.tonal(onPressed: _cancelling ? null : () => _cancel(booking), child: Text(_cancelling ? 'Cancelling...' : 'Cancel session')),
  ]));

  Future<void> _cancel(MentorBooking booking) async {
    setState(() { _cancelling = true; _error = null; });
    try {
      final cancelled = await ref.read(learningApiProvider).cancelMentorBooking(booking.id);
      ref.invalidate(mentorBookingProvider(widget.bookingId));
      ref.invalidate(mentorBookingsProvider('upcoming'));
      ref.invalidate(mentorBookingsProvider('past'));
      ref.invalidate(mentorBookableSlotsProvider(
        MentorBookableSlotsRequest(mentorId: booking.mentor.id, date: booking.localDate),
      ));
      if (mounted) setState(() => _updated = cancelled);
    } on DioException catch (error) {
      if (mounted) setState(() => _error = error.response?.data is Map ? (error.response!.data['message']?.toString() ?? 'Could not cancel session.') : 'Could not cancel session.');
    } finally { if (mounted) setState(() => _cancelling = false); }
  }
}
