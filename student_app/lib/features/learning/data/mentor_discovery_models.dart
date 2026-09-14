Map<String, dynamic> _mentorMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const <String, dynamic>{};

class MentorDiscoverySubject {
  final String id;
  final String name;

  const MentorDiscoverySubject({required this.id, required this.name});

  factory MentorDiscoverySubject.fromJson(Map<String, dynamic> json) =>
      MentorDiscoverySubject(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
      );
}

class MentorAvailabilityWindow {
  final int dayOfWeek;
  final int startMinute;
  final int endMinute;

  const MentorAvailabilityWindow({
    required this.dayOfWeek,
    required this.startMinute,
    required this.endMinute,
  });

  factory MentorAvailabilityWindow.fromJson(Map<String, dynamic> json) =>
      MentorAvailabilityWindow(
        dayOfWeek: json['dayOfWeek'] as int? ?? 0,
        startMinute: json['startMinute'] as int? ?? 0,
        endMinute: json['endMinute'] as int? ?? 0,
      );
}

class StudentMentor {
  final String id;
  final String fullName;
  final String? headline;
  final String? bio;
  final String? profileImageUrl;
  final int experienceYears;
  final String timezone;
  final List<MentorDiscoverySubject> subjects;

  const StudentMentor({
    required this.id,
    required this.fullName,
    required this.headline,
    required this.bio,
    required this.profileImageUrl,
    required this.experienceYears,
    required this.timezone,
    required this.subjects,
  });

  factory StudentMentor.fromJson(Map<String, dynamic> json) => StudentMentor(
        id: json['id']?.toString() ?? '',
        fullName: json['fullName']?.toString() ?? '',
        headline: json['headline']?.toString(),
        bio: json['bio']?.toString(),
        profileImageUrl: json['profileImageUrl']?.toString(),
        experienceYears: json['experienceYears'] as int? ?? 0,
        timezone: json['timezone']?.toString() ?? 'UTC',
        subjects: (json['subjects'] as List? ?? const [])
            .map((item) => MentorDiscoverySubject.fromJson(_mentorMap(item)))
            .toList(),
      );
}

class StudentMentorDetail extends StudentMentor {
  final List<MentorAvailabilityWindow> availability;

  const StudentMentorDetail({
    required super.id,
    required super.fullName,
    required super.headline,
    required super.bio,
    required super.profileImageUrl,
    required super.experienceYears,
    required super.timezone,
    required super.subjects,
    required this.availability,
  });

  factory StudentMentorDetail.fromJson(Map<String, dynamic> json) {
    final mentor = StudentMentor.fromJson(json);
    return StudentMentorDetail(
      id: mentor.id,
      fullName: mentor.fullName,
      headline: mentor.headline,
      bio: mentor.bio,
      profileImageUrl: mentor.profileImageUrl,
      experienceYears: mentor.experienceYears,
      timezone: mentor.timezone,
      subjects: mentor.subjects,
      availability: (json['availability'] as List? ?? const [])
          .map((item) => MentorAvailabilityWindow.fromJson(_mentorMap(item)))
          .toList(),
    );
  }
}

class MentorDiscoveryFilters {
  final String? subjectId;
  final String? search;

  const MentorDiscoveryFilters({this.subjectId, this.search});

  Map<String, dynamic> toQuery() => {
        if (subjectId?.trim().isNotEmpty == true) 'subjectId': subjectId!.trim(),
        if (search?.trim().isNotEmpty == true) 'search': search!.trim(),
      };

  @override
  bool operator ==(Object other) =>
      other is MentorDiscoveryFilters &&
      other.subjectId == subjectId &&
      other.search == search;

  @override
  int get hashCode => Object.hash(subjectId, search);
}

class MentorBookableSlot {
  final DateTime scheduledStartAt;
  final DateTime scheduledEndAt;
  final String localStartTime;
  final String localEndTime;

  const MentorBookableSlot({
    required this.scheduledStartAt,
    required this.scheduledEndAt,
    required this.localStartTime,
    required this.localEndTime,
  });

  factory MentorBookableSlot.fromJson(Map<String, dynamic> json) => MentorBookableSlot(
        scheduledStartAt: DateTime.parse(json['scheduledStartAt']?.toString() ?? ''),
        scheduledEndAt: DateTime.parse(json['scheduledEndAt']?.toString() ?? ''),
        localStartTime: json['localStartTime']?.toString() ?? '',
        localEndTime: json['localEndTime']?.toString() ?? '',
      );
}

class MentorBookableSlots {
  final String mentorId;
  final String mentorTimezone;
  final String date;
  final List<MentorBookableSlot> slots;

  const MentorBookableSlots({required this.mentorId, required this.mentorTimezone, required this.date, required this.slots});

  factory MentorBookableSlots.fromJson(Map<String, dynamic> json) => MentorBookableSlots(
        mentorId: json['mentorId']?.toString() ?? '',
        mentorTimezone: json['mentorTimezone']?.toString() ?? 'UTC',
        date: json['date']?.toString() ?? '',
        slots: (json['slots'] as List? ?? const [])
            .map((item) => MentorBookableSlot.fromJson(_mentorMap(item)))
            .toList(),
      );
}

class MentorBooking {
  final String id;
  final String status;
  final DateTime scheduledStartAt;
  final DateTime scheduledEndAt;
  final String mentorTimezone;
  final String localDate;
  final String localStartTime;
  final String localEndTime;
  final DateTime createdAt;

  const MentorBooking({required this.id, required this.status, required this.scheduledStartAt, required this.scheduledEndAt, required this.mentorTimezone, required this.localDate, required this.localStartTime, required this.localEndTime, required this.createdAt});

  factory MentorBooking.fromJson(Map<String, dynamic> json) => MentorBooking(
        id: json['id']?.toString() ?? '',
        status: json['status']?.toString() ?? 'PENDING',
        scheduledStartAt: DateTime.parse(json['scheduledStartAt']?.toString() ?? ''),
        scheduledEndAt: DateTime.parse(json['scheduledEndAt']?.toString() ?? ''),
        mentorTimezone: json['mentorTimezone']?.toString() ?? 'UTC',
        localDate: json['localDate']?.toString() ?? '',
        localStartTime: json['localStartTime']?.toString() ?? '',
        localEndTime: json['localEndTime']?.toString() ?? '',
        createdAt: DateTime.parse(json['createdAt']?.toString() ?? ''),
      );
}

class MentorBookableSlotsRequest {
  final String mentorId;
  final String date;
  const MentorBookableSlotsRequest({required this.mentorId, required this.date});
  @override
  bool operator ==(Object other) => other is MentorBookableSlotsRequest && other.mentorId == mentorId && other.date == date;
  @override
  int get hashCode => Object.hash(mentorId, date);
}
