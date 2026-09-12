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
