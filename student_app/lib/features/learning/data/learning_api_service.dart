import 'package:dio/dio.dart';
import 'learning_models.dart';

class LearningApiService {
  final Dio dio;
  LearningApiService(this.dio);
  Future<List<LearningVideo>> videos({String? topicId}) async {
    final r = await dio.get('/learning/videos',
        queryParameters: {if (topicId != null) 'topicId': topicId});
    return ((r.data as List?) ?? [])
        .cast<Map<String, dynamic>>()
        .map(LearningVideo.fromJson)
        .toList();
  }

  Future<List<RevisionItem>> revisions({String? topicId, String? type}) async {
    final r = await dio.get('/learning/revision', queryParameters: {
      if (topicId != null) 'topicId': topicId,
      if (type != null) 'type': type
    });
    return ((r.data as List?) ?? [])
        .cast<Map<String, dynamic>>()
        .map(RevisionItem.fromJson)
        .toList();
  }

  Future<LearningVideo> video(String id) async =>
      LearningVideo.fromJson((await dio.get('/learning/videos/$id')).data);
  Future<VideoPlayback> playback(String id) async => VideoPlayback.fromJson(
      (await dio.get('/learning/videos/$id/playback')).data);
  Future<VideoProgress> progress(String id) async => VideoProgress.fromJson(
      (await dio.get('/learning/videos/$id/progress')).data);
  Future<VideoProgress> sync(String id, int pos, int watched) async =>
      VideoProgress.fromJson((await dio.put('/learning/videos/$id/progress',
              data: {'lastPositionSeconds': pos, 'watchedSeconds': watched}))
          .data);
  Future<List<LearningTopic>> chapter(String id) async {
    final r = await dio.get('/learning/chapters/$id');
    return ((r.data['topics'] as List?) ?? [])
        .cast<Map<String, dynamic>>()
        .map(LearningTopic.fromJson)
        .toList();
  }
}
