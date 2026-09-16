import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/mentor_discovery_models.dart';

void main() {
  test('parses the server-authoritative student video bootstrap without secrets', () {
    final access = MentorVideoAccess.fromJson({
      'bookingId': 'booking-1',
      'videoSessionId': 'video-session-1',
      'participantRole': 'STUDENT',
      'scheduledStartAt': '2026-09-15T10:00:00.000Z',
      'scheduledEndAt': '2026-09-15T10:15:00.000Z',
      'accessExpiresAt': '2026-09-15T10:15:00.000Z',
    });

    expect(access.bookingId, 'booking-1');
    expect(access.videoSessionId, 'video-session-1');
    expect(access.participantRole, 'STUDENT');
    expect(access.accessExpiresAt, DateTime.parse('2026-09-15T10:15:00.000Z'));
  });
}
