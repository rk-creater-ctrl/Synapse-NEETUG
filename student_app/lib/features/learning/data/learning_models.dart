class LearningVideo {
  final String id, title;
  final String? instructorName;
  final int? durationSeconds;
  final bool isFree;
  const LearningVideo(
      {required this.id,
      required this.title,
      this.instructorName,
      this.durationSeconds,
      required this.isFree});
  factory LearningVideo.fromJson(Map<String, dynamic> j) => LearningVideo(
      id: j['id'] as String,
      title: j['title'] as String,
      instructorName: j['instructorName'] as String?,
      durationSeconds: j['durationSeconds'] as int?,
      isFree: j['isFree'] as bool? ?? true);
}

class VideoProgress {
  final int lastPositionSeconds, watchedSeconds;
  final double completionPercentage;
  final bool completed;
  const VideoProgress(
      {required this.lastPositionSeconds,
      required this.watchedSeconds,
      required this.completionPercentage,
      required this.completed});
  factory VideoProgress.fromJson(Map<String, dynamic>? j) => VideoProgress(
      lastPositionSeconds: j?['lastPositionSeconds'] as int? ?? 0,
      watchedSeconds: j?['watchedSeconds'] as int? ?? 0,
      completionPercentage:
          (j?['completionPercentage'] as num? ?? 0).toDouble(),
      completed: j?['completed'] as bool? ?? false);
}

class VideoPlayback {
  final String? playbackUrl;
  final String provider;
  const VideoPlayback({this.playbackUrl, required this.provider});
  factory VideoPlayback.fromJson(Map<String, dynamic> j) => VideoPlayback(
      playbackUrl: j['playbackUrl'] as String?,
      provider: j['provider'] as String);
}

class LearningTopic {
  final String id, name;
  final int videoCount, revisionCount;
  const LearningTopic(
      {required this.id,
      required this.name,
      required this.videoCount,
      required this.revisionCount});
  factory LearningTopic.fromJson(Map<String, dynamic> j) {
    final c = j['_count'] as Map<String, dynamic>? ?? {};
    return LearningTopic(
        id: j['id'] as String,
        name: j['name'] as String,
        videoCount: c['videos'] as int? ?? 0,
        revisionCount: c['revisionItems'] as int? ?? 0);
  }
}

class RevisionItem {
  final String id, title, type, content;
  const RevisionItem(
      {required this.id,
      required this.title,
      required this.type,
      required this.content});
  factory RevisionItem.fromJson(Map<String, dynamic> j) => RevisionItem(
      id: j['id'] as String,
      title: j['title'] as String,
      type: j['type'] as String,
      content: j['content'] as String? ?? '');
}
