import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/mentor_discovery_models.dart';
import '../providers/learning_providers.dart';

class MentorBookingScreen extends ConsumerStatefulWidget {
  final String mentorId;
  const MentorBookingScreen({super.key, required this.mentorId});

  @override
  ConsumerState<MentorBookingScreen> createState() => _MentorBookingScreenState();
}

class _MentorBookingScreenState extends ConsumerState<MentorBookingScreen> {
  late DateTime _selectedDate;
  MentorBookableSlot? _selectedSlot;
  MentorBooking? _booking;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selectedDate = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
  }

  String get _date => '${_selectedDate.year.toString().padLeft(4, '0')}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';
  MentorBookableSlotsRequest get _request => MentorBookableSlotsRequest(mentorId: widget.mentorId, date: _date);

  @override
  Widget build(BuildContext context) {
    if (_booking != null) return _success(_booking!);
    final state = ref.watch(mentorBookableSlotsProvider(_request));
    return Scaffold(
      appBar: AppBar(title: const Text('Book mentor session')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Expanded(child: Text('Date: $_date')),
            TextButton(onPressed: _chooseDate, child: const Text('Choose date')),
          ]),
        ),
        Expanded(child: state.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => Center(child: TextButton(onPressed: () => ref.invalidate(mentorBookableSlotsProvider(_request)), child: const Text('Could not load slots. Retry'))),
          data: _slots,
        )),
      ]),
      bottomNavigationBar: _selectedSlot == null ? null : SafeArea(child: Padding(
        padding: const EdgeInsets.all(16),
        child: FilledButton(
          onPressed: _submitting ? null : _confirm,
          child: Text(_submitting ? 'Booking...' : 'Confirm 15-minute session'),
        ),
      )),
    );
  }

  Widget _slots(MentorBookableSlots slots) {
    if (slots.slots.isEmpty) return Center(child: Text('No bookable 15-minute slots are available on $_date.'));
    return Column(children: [
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text('Times shown in ${slots.mentorTimezone}.')),
      if (_error != null) Padding(padding: const EdgeInsets.all(12), child: Text(_error!, style: const TextStyle(color: Colors.red))),
      Expanded(
        child: RadioGroup<MentorBookableSlot>(
          groupValue: _selectedSlot,
          onChanged: (value) {
            if (_submitting) return;
            setState(() {
              _selectedSlot = value;
              _error = null;
            });
          },
          child: ListView.builder(
            itemCount: slots.slots.length,
            itemBuilder: (_, index) {
              final slot = slots.slots[index];
              return RadioListTile<MentorBookableSlot>(
                value: slot,
                title: Text('${slot.localStartTime} - ${slot.localEndTime}'),
              );
            },
          ),
        ),
      ),
    ]);
  }

  Widget _success(MentorBooking booking) => Scaffold(
    appBar: AppBar(title: const Text('Booking confirmed')),
    body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Text('Your 15-minute mentor session is booked.'),
      const SizedBox(height: 8),
      Text('${booking.localDate} ${booking.localStartTime} - ${booking.localEndTime}'),
      Text('Status: ${booking.status}'),
      Text('Mentor timezone: ${booking.mentorTimezone}'),
      const SizedBox(height: 16),
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
    ]))),
  );

  Future<void> _chooseDate() async {
    final next = await showDatePicker(context: context, initialDate: _selectedDate, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)));
    if (next != null) setState(() { _selectedDate = next; _selectedSlot = null; _error = null; });
  }

  Future<void> _confirm() async {
    final slot = _selectedSlot;
    if (slot == null) return;
    setState(() { _submitting = true; _error = null; });
    try {
      final booking = await ref.read(learningApiProvider).createMentorBooking(widget.mentorId, slot.scheduledStartAt);
      if (mounted) setState(() => _booking = booking);
    } on DioException catch (error) {
      if (mounted) setState(() => _error = error.response?.data is Map ? (error.response!.data['message']?.toString() ?? 'Could not create booking.') : 'Could not create booking.');
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not create booking.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

