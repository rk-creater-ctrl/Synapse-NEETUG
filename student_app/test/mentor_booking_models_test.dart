import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/mentor_discovery_models.dart';

void main() {
  test('parses server-authoritative mentor-local bookable slots', () {
    final slots = MentorBookableSlots.fromJson({
      'mentorId': 'mentor-1',
      'mentorTimezone': 'Asia/Kolkata',
      'date': '2026-09-14',
      'slots': [
        {
          'scheduledStartAt': '2026-09-14T03:30:00.000Z',
          'scheduledEndAt': '2026-09-14T03:45:00.000Z',
          'localStartTime': '09:00',
          'localEndTime': '09:15',
        },
      ],
    });

    expect(slots.mentorTimezone, 'Asia/Kolkata');
    expect(slots.slots.single.localStartTime, '09:00');
    expect(slots.slots.single.scheduledEndAt.difference(slots.slots.single.scheduledStartAt).inMinutes, 15);
  });

  test('parses a safe booking confirmation with mentor-local display values', () {
    final booking = MentorBooking.fromJson({
      'id': 'booking-1',
      'status': 'PENDING',
      'scheduledStartAt': '2026-09-14T03:30:00.000Z',
      'scheduledEndAt': '2026-09-14T03:45:00.000Z',
      'mentorTimezone': 'Asia/Kolkata',
      'localDate': '2026-09-14',
      'localStartTime': '09:00',
      'localEndTime': '09:15',
      'createdAt': '2026-09-13T00:00:00.000Z',
    });

    expect(booking.status, 'PENDING');
    expect(booking.localStartTime, '09:00');
    expect(booking.localEndTime, '09:15');
  });
}
