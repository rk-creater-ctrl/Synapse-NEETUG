import 'dart:io';

import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import 'community_models.dart';

class CommunityUploadAttachment {
  final String path;
  final String fileName;
  final String mimeType;
  final int sizeBytes;
  const CommunityUploadAttachment({required this.path, required this.fileName, required this.mimeType, required this.sizeBytes});
}

class CommunityApiService {
  final Dio dio;
  CommunityApiService(this.dio);

  Future<List<Community>> discover() async {
    final response = await dio.get('/communities');
    return _list(response.data).map(Community.fromJson).toList();
  }

  Future<List<Community>> mine() async {
    final response = await dio.get('/communities/me');
    return _list(response.data).map(Community.fromJson).toList();
  }

  Future<Community> getCommunity(String communityId) async => Community.fromJson(_map((await dio.get('/communities/$communityId')).data));
  Future<Community> join(String communityId) async => Community.fromJson(_map((await dio.post('/communities/$communityId/join')).data));
  Future<void> leave(String communityId) async { await dio.post('/communities/$communityId/leave'); }

  Future<CommunityMessagePage> history(String communityId, {String? cursor, int limit = 50}) async => CommunityMessagePage.fromJson(_map((await dio.get(
    '/communities/$communityId/messages', queryParameters: {'limit': limit, if (cursor != null) 'cursor': cursor},
  )).data));

  Future<CommunityMessage> sendText(String communityId, String content, {String? replyToMessageId}) async => CommunityMessage.fromJson(_map((await dio.post(
    '/communities/$communityId/messages', data: {'content': content, if (replyToMessageId != null) 'replyToMessageId': replyToMessageId},
  )).data));

  Future<CommunityMessage> sendAttachments(String communityId, List<CommunityUploadAttachment> attachments, {String? content, String? replyToMessageId}) async {
    validateAttachments(attachments);
    final files = await Future.wait(attachments.map((attachment) => MultipartFile.fromFile(attachment.path, filename: attachment.fileName, contentType: DioMediaType.parse(attachment.mimeType))));
    final response = await dio.post('/communities/$communityId/messages/attachments', data: FormData.fromMap({
      if (content?.trim().isNotEmpty == true) 'content': content!.trim(),
      if (replyToMessageId != null) 'replyToMessageId': replyToMessageId,
      'files': files,
    }));
    return CommunityMessage.fromJson(_map(response.data));
  }

  Future<CommunityMessageReactionState> toggleReaction(String communityId, String messageId, CommunityReactionType type) async => CommunityMessageReactionState.fromJson(_map((await dio.put(
    '/communities/$communityId/messages/$messageId/reaction', data: {'type': type.name.toUpperCase()},
  )).data));

  Future<void> report(String communityId, String messageId, CommunityReportReason reason, {String? details}) async {
    await dio.post('/communities/$communityId/messages/$messageId/reports', data: {
      'reason': _wireReportReason(reason), if (details?.trim().isNotEmpty == true) 'details': details!.trim(),
    });
  }

  Future<void> openAttachment(CommunityAttachment attachment) async {
    final response = await dio.get<List<int>>('/communities/attachments/${attachment.id}', options: Options(responseType: ResponseType.bytes));
    final cache = await getTemporaryDirectory();
    final file = File('${cache.path}${Platform.pathSeparator}${safeCommunityAttachmentFileName(attachment.id, attachment.fileName)}');
    await file.writeAsBytes(response.data ?? const [], flush: true);
    await OpenFilex.open(file.path, type: attachment.mimeType);
  }

  void validateAttachments(List<CommunityUploadAttachment> attachments) {
    if (attachments.isEmpty || attachments.length > CommunityAttachmentValidation.maxCount) throw const FormatException('Choose between one and four attachments.');
    final total = attachments.fold<int>(0, (sum, attachment) {
      if (!CommunityAttachmentValidation.isAllowed(attachment.mimeType)) throw const FormatException('Only JPEG, PNG, WebP, and PDF attachments are supported.');
      final max = attachment.mimeType == 'application/pdf' ? CommunityAttachmentValidation.maxPdfBytes : CommunityAttachmentValidation.maxImageBytes;
      if (attachment.sizeBytes > max) throw const FormatException('One or more attachments exceed the allowed file size.');
      return sum + attachment.sizeBytes;
    });
    if (total > CommunityAttachmentValidation.maxTotalBytes) throw const FormatException('Attachment total exceeds 40 MB.');
  }

  static List<Map<String, dynamic>> _list(Object? value) => (value as List? ?? const []).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
  static Map<String, dynamic> _map(Object? value) => value is Map ? Map<String, dynamic>.from(value) : const {};
  static String _wireReportReason(CommunityReportReason reason) => switch (reason) {
    CommunityReportReason.inappropriateContent => 'INAPPROPRIATE_CONTENT',
    _ => reason.name.toUpperCase(),
  };
}

String safeCommunityAttachmentFileName(String attachmentId, String value) {
  final safeId = attachmentId.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
  final sanitized = value
    .replaceAll(RegExp(r'^.*[\\/]'), '')
    .replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
  final name = sanitized.isEmpty || RegExp(r'^[._-]+$').hasMatch(sanitized)
    ? 'attachment'
    : sanitized;
  return 'community_${safeId.isEmpty ? 'attachment' : safeId}_$name';
}

class CommunityMessageReactionState {
  final String messageId;
  final List<CommunityReactionSummary> reactions;
  final CommunityReactionType? myReaction;
  const CommunityMessageReactionState({required this.messageId, required this.reactions, required this.myReaction});
  factory CommunityMessageReactionState.fromJson(Map<String, dynamic> json) => CommunityMessageReactionState(
    messageId: json['messageId']?.toString() ?? '',
    reactions: (json['reactions'] as List? ?? const []).whereType<Map>().map((item) => CommunityReactionSummary.fromJson(Map<String, dynamic>.from(item))).toList(),
    myReaction: json['myReaction'] == null ? null : CommunityReactionType.values.firstWhere((type) => type.name == json['myReaction'].toString().toLowerCase(), orElse: () => CommunityReactionType.unknown),
  );
}
