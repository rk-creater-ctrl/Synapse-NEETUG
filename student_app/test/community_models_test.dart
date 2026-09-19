import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:synapse_neetug/features/community/data/community_api_service.dart';
import 'package:synapse_neetug/features/community/data/community_models.dart';

void main() {
  CommunityMessage message(String id, DateTime createdAt, {bool deleted = false}) => CommunityMessage.fromJson({
    'id': id, 'communityId': 'community-1', 'content': deleted ? null : 'Message $id', 'isDeleted': deleted,
    'createdAt': createdAt.toIso8601String(), 'author': {'id': 'user-1', 'displayName': 'Student'},
    'attachments': [], 'reactions': [{'type': 'LIKE', 'count': 1}], 'myReaction': 'LIKE',
  });

  test('parses safe community message, reply, attachments, and reactions', () {
    final parsed = CommunityMessage.fromJson({
      'id': 'message-1', 'communityId': 'community-1', 'content': 'Hello', 'isDeleted': false,
      'createdAt': '2026-09-19T00:00:00.000Z', 'author': {'id': 'user-1', 'displayName': 'Student'},
      'attachments': [{'id': 'attachment-1', 'type': 'DOCUMENT', 'fileName': 'notes.pdf', 'mimeType': 'application/pdf', 'sizeBytes': 12}],
      'replyTo': {'id': 'message-0', 'content': 'Earlier', 'isDeleted': false, 'attachmentCount': 0, 'author': {'id': 'user-2', 'displayName': 'Mentor'}},
      'reactions': [{'type': 'INSIGHTFUL', 'count': 2}], 'myReaction': 'INSIGHTFUL',
    });
    expect(parsed.attachments.single.type, CommunityAttachmentType.document);
    expect(parsed.replyTo?.author.displayName, 'Mentor');
    expect(parsed.reactions.single.type, CommunityReactionType.insightful);
    expect(parsed.myReaction, CommunityReactionType.insightful);
  });

  test('redacts a deleted message locally without retaining content or reactions', () {
    final deleted = message('message-1', DateTime.utc(2026)).deleted();
    expect(deleted.isDeleted, isTrue);
    expect(deleted.content, isNull);
    expect(deleted.attachments, isEmpty);
    expect(deleted.reactions, isEmpty);
    expect(deleted.myReaction, isNull);
  });

  test('deduplicates history and realtime messages by persisted ID in stable chronological order', () {
    final first = message('message-1', DateTime.utc(2026, 1, 1));
    final second = message('message-2', DateTime.utc(2026, 1, 2));
    final merged = mergeCommunityMessages([second], [first, second]);
    expect(merged.map((item) => item.id), ['message-1', 'message-2']);
  });

  test('realtime aggregate updates do not overwrite the viewer reaction', () {
    final original = message('message-1', DateTime.utc(2026));
    final updated = applyCommunityReaction([original], 'message-1', const [CommunityReactionSummary(type: CommunityReactionType.love, count: 3)]).single;
    expect(updated.reactions.single.type, CommunityReactionType.love);
    expect(updated.myReaction, CommunityReactionType.like);
  });

  test('publishing and reaction policies distinguish channel members', () {
    final channel = Community.fromJson({
      'id': 'channel', 'name': 'Channel', 'type': 'CHANNEL', 'visibility': 'PUBLIC', 'membershipRole': 'MEMBER',
      'viewerMembership': {'userId': 'user-1', 'role': 'MEMBER', 'mutedUntil': null},
    });
    final group = Community.fromJson({
      'id': 'group', 'name': 'Group', 'type': 'GROUP', 'visibility': 'PUBLIC', 'membershipRole': 'MEMBER',
      'viewerMembership': {'userId': 'user-1', 'role': 'MEMBER', 'mutedUntil': null},
    });
    expect(mayPublishInCommunity(channel), isFalse);
    expect(mayReactInCommunity(channel), isTrue);
    expect(mayPublishInCommunity(group), isTrue);
    expect(mayReactInCommunity(group), isTrue);
  });

  test('muted channel members and public non-members cannot react', () {
    final mutedChannelMember = Community.fromJson({
      'id': 'channel', 'name': 'Channel', 'type': 'CHANNEL', 'visibility': 'PUBLIC', 'membershipRole': 'MEMBER',
      'viewerMembership': {'userId': 'user-1', 'role': 'MEMBER', 'mutedUntil': '2030-01-01T00:00:00.000Z'},
    });
    final publicReader = Community.fromJson({
      'id': 'public', 'name': 'Public', 'type': 'CHANNEL', 'visibility': 'PUBLIC',
    });
    expect(mayReactInCommunity(mutedChannelMember, now: DateTime.utc(2026)), isFalse);
    expect(mayReactInCommunity(publicReader), isFalse);
    expect(mayPublishInCommunity(publicReader), isFalse);
    expect(mayOpenDiscoveredCommunity(publicReader), isTrue);
  });

  test('expired viewer mute no longer blocks eligible community actions', () {
    final groupMember = Community.fromJson({
      'id': 'group', 'name': 'Group', 'type': 'GROUP', 'visibility': 'PUBLIC', 'membershipRole': 'MEMBER',
      'viewerMembership': {'userId': 'user-1', 'role': 'MEMBER', 'mutedUntil': '2025-01-01T00:00:00.000Z'},
    });
    final now = DateTime.utc(2026);
    expect(mayPublishInCommunity(groupMember, now: now), isTrue);
    expect(mayReactInCommunity(groupMember, now: now), isTrue);
  });

  test('identifies only current-viewer moderation events for authoritative refresh', () {
    final community = Community.fromJson({
      'id': 'group', 'name': 'Group', 'type': 'GROUP', 'visibility': 'PUBLIC', 'membershipRole': 'MEMBER',
      'viewerMembership': {'userId': 'user-1', 'role': 'MEMBER', 'mutedUntil': null},
    });
    expect(isCurrentCommunityViewer(community, 'user-1'), isTrue);
    expect(isCurrentCommunityViewer(community, 'user-2'), isFalse);
  });

  test('unknown server enum values remain non-publishable', () {
    final unknown = Community.fromJson({'id': 'unknown', 'name': 'Unknown', 'type': 'GROUP', 'visibility': 'PUBLIC', 'membershipRole': 'FUTURE_ROLE'});
    expect(unknown.membershipRole, CommunityRole.unknown);
    expect(mayPublishInCommunity(unknown), isFalse);
  });

  test('attachment limits recognize permitted formats and bounded sizes', () {
    final api = CommunityApiService(Dio());
    expect(CommunityAttachmentValidation.isAllowed('image/webp'), isTrue);
    expect(CommunityAttachmentValidation.isAllowed('text/plain'), isFalse);
    expect(CommunityAttachmentValidation.maxCount, 4);
    expect(() => api.validateAttachments(List.generate(5, (index) => CommunityUploadAttachment(path: '/tmp/$index.jpg', fileName: '$index.jpg', mimeType: 'image/jpeg', sizeBytes: 1))), throwsA(isA<FormatException>()));
    expect(() => api.validateAttachments([const CommunityUploadAttachment(path: '/tmp/file.txt', fileName: 'file.txt', mimeType: 'text/plain', sizeBytes: 1)]), throwsA(isA<FormatException>()));
    expect(() => api.validateAttachments([const CommunityUploadAttachment(path: '/tmp/file.pdf', fileName: 'file.pdf', mimeType: 'application/pdf', sizeBytes: CommunityAttachmentValidation.maxPdfBytes + 1)]), throwsA(isA<FormatException>()));
    expect(() => api.validateAttachments(List.generate(4, (index) => CommunityUploadAttachment(path: '/tmp/$index.pdf', fileName: '$index.pdf', mimeType: 'application/pdf', sizeBytes: 11 * 1024 * 1024))), throwsA(isA<FormatException>()));
  });

  test('creates safe local attachment filenames', () {
    expect(safeCommunityAttachmentFileName('attachment-1', 'notes.pdf'), 'community_attachment-1_notes.pdf');
    expect(safeCommunityAttachmentFileName('attachment-1', '../notes.pdf'), 'community_attachment-1_notes.pdf');
    expect(safeCommunityAttachmentFileName('attachment-1', '.'), 'community_attachment-1_attachment');
    expect(safeCommunityAttachmentFileName('attachment-1', '..'), 'community_attachment-1_attachment');
    expect(safeCommunityAttachmentFileName('attachment-1', '***'), 'community_attachment-1_attachment');
  });
}
