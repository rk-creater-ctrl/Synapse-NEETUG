enum CommunityType { group, channel, unknown }
enum CommunityVisibility { public, private, unknown }
enum CommunityRole { owner, admin, moderator, member, unknown }
enum CommunityReactionType { like, love, celebrate, insightful, unknown }
enum CommunityAttachmentType { image, document, unknown }
enum CommunityReportReason { spam, harassment, abuse, misinformation, inappropriateContent, other, unknown }

T _enumValue<T extends Enum>(Iterable<T> values, String? value, T fallback) =>
    values.firstWhere((item) => item.name.toLowerCase() == value?.toLowerCase().replaceAll('_', ''), orElse: () => fallback);

Map<String, dynamic> _map(Object? value) => value is Map ? Map<String, dynamic>.from(value) : const {};

class Community {
  final String id;
  final String name;
  final String? description;
  final CommunityType type;
  final CommunityVisibility visibility;
  final CommunityRole? membershipRole;
  final DateTime? createdAt;

  const Community({required this.id, required this.name, required this.description, required this.type, required this.visibility, required this.membershipRole, required this.createdAt});
  factory Community.fromJson(Map<String, dynamic> json) => Community(
    id: json['id']?.toString() ?? '', name: json['name']?.toString() ?? 'Community', description: json['description']?.toString(),
    type: _enumValue(CommunityType.values, json['type']?.toString(), CommunityType.unknown),
    visibility: _enumValue(CommunityVisibility.values, json['visibility']?.toString(), CommunityVisibility.unknown),
    membershipRole: json['membershipRole'] == null ? null : _enumValue(CommunityRole.values, json['membershipRole']?.toString(), CommunityRole.unknown),
    createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
  );
  String get typeLabel => type.name.toUpperCase();
  String get visibilityLabel => visibility.name.toUpperCase();
}

class CommunityAuthor {
  final String id;
  final String displayName;
  const CommunityAuthor({required this.id, required this.displayName});
  factory CommunityAuthor.fromJson(Map<String, dynamic> json) => CommunityAuthor(id: json['id']?.toString() ?? '', displayName: json['displayName']?.toString() ?? 'User');
}

class CommunityAttachment {
  final String id;
  final CommunityAttachmentType type;
  final String fileName;
  final String mimeType;
  final int sizeBytes;
  const CommunityAttachment({required this.id, required this.type, required this.fileName, required this.mimeType, required this.sizeBytes});
  factory CommunityAttachment.fromJson(Map<String, dynamic> json) => CommunityAttachment(
    id: json['id']?.toString() ?? '', type: _enumValue(CommunityAttachmentType.values, json['type']?.toString(), CommunityAttachmentType.unknown),
    fileName: json['fileName']?.toString() ?? 'Attachment', mimeType: json['mimeType']?.toString() ?? 'application/octet-stream', sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
  );
}

class CommunityReplyPreview {
  final String id;
  final String? content;
  final bool isDeleted;
  final int attachmentCount;
  final CommunityAuthor author;
  const CommunityReplyPreview({required this.id, required this.content, required this.isDeleted, required this.attachmentCount, required this.author});
  factory CommunityReplyPreview.fromJson(Map<String, dynamic> json) => CommunityReplyPreview(
    id: json['id']?.toString() ?? '', content: json['content']?.toString(), isDeleted: json['isDeleted'] == true,
    attachmentCount: (json['attachmentCount'] as num?)?.toInt() ?? 0, author: CommunityAuthor.fromJson(_map(json['author'])),
  );
}

class CommunityReactionSummary {
  final CommunityReactionType type;
  final int count;
  const CommunityReactionSummary({required this.type, required this.count});
  factory CommunityReactionSummary.fromJson(Map<String, dynamic> json) => CommunityReactionSummary(
    type: _enumValue(CommunityReactionType.values, json['type']?.toString(), CommunityReactionType.unknown), count: (json['count'] as num?)?.toInt() ?? 0,
  );
}

class CommunityMessage {
  final String id;
  final String communityId;
  final String? content;
  final bool isDeleted;
  final String? replyToMessageId;
  final CommunityReplyPreview? replyTo;
  final DateTime? createdAt;
  final CommunityAuthor author;
  final List<CommunityAttachment> attachments;
  final List<CommunityReactionSummary> reactions;
  final CommunityReactionType? myReaction;

  const CommunityMessage({required this.id, required this.communityId, required this.content, required this.isDeleted, required this.replyToMessageId, required this.replyTo, required this.createdAt, required this.author, required this.attachments, required this.reactions, required this.myReaction});
  factory CommunityMessage.fromJson(Map<String, dynamic> json) => CommunityMessage(
    id: json['id']?.toString() ?? '', communityId: json['communityId']?.toString() ?? '', content: json['content']?.toString(), isDeleted: json['isDeleted'] == true,
    replyToMessageId: json['replyToMessageId']?.toString(), replyTo: json['replyTo'] is Map ? CommunityReplyPreview.fromJson(_map(json['replyTo'])) : null,
    createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''), author: CommunityAuthor.fromJson(_map(json['author'])),
    attachments: (json['attachments'] as List? ?? const []).map((item) => CommunityAttachment.fromJson(_map(item))).toList(),
    reactions: (json['reactions'] as List? ?? const []).map((item) => CommunityReactionSummary.fromJson(_map(item))).toList(),
    myReaction: json['myReaction'] == null ? null : _enumValue(CommunityReactionType.values, json['myReaction']?.toString(), CommunityReactionType.unknown),
  );
  CommunityMessage copyWith({String? content, bool clearContent = false, bool? isDeleted, List<CommunityAttachment>? attachments, List<CommunityReactionSummary>? reactions, CommunityReactionType? myReaction, bool clearMyReaction = false}) => CommunityMessage(
    id: id, communityId: communityId, content: clearContent ? null : (content ?? this.content), isDeleted: isDeleted ?? this.isDeleted, replyToMessageId: replyToMessageId, replyTo: replyTo, createdAt: createdAt, author: author,
    attachments: attachments ?? this.attachments, reactions: reactions ?? this.reactions, myReaction: clearMyReaction ? null : (myReaction ?? this.myReaction),
  );
  CommunityMessage deleted() => copyWith(clearContent: true, isDeleted: true, attachments: const [], reactions: const [], clearMyReaction: true);
}

class CommunityMessagePage {
  final List<CommunityMessage> items;
  final String? nextCursor;
  const CommunityMessagePage({required this.items, required this.nextCursor});
  factory CommunityMessagePage.fromJson(Map<String, dynamic> json) => CommunityMessagePage(
    items: (json['items'] as List? ?? const []).map((item) => CommunityMessage.fromJson(_map(item))).toList(), nextCursor: json['nextCursor']?.toString(),
  );
}

List<CommunityMessage> mergeCommunityMessages(List<CommunityMessage> current, Iterable<CommunityMessage> incoming) {
  final messages = <String, CommunityMessage>{for (final message in current) message.id: message};
  for (final message in incoming) { if (message.id.isNotEmpty) messages[message.id] = message; }
  final merged = messages.values.toList()..sort((left, right) {
    final time = (left.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0)).compareTo(right.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0));
    return time != 0 ? time : left.id.compareTo(right.id);
  });
  return merged;
}

List<CommunityMessage> redactCommunityMessage(List<CommunityMessage> messages, String messageId) => messages.map((message) => message.id == messageId ? message.deleted() : message).toList();

List<CommunityMessage> applyCommunityReaction(List<CommunityMessage> messages, String messageId, List<CommunityReactionSummary> reactions) => messages.map((message) => message.id == messageId && !message.isDeleted ? message.copyWith(reactions: reactions) : message).toList();

bool mayPublishInCommunity(Community community, {bool muted = false}) => !muted &&
  community.membershipRole != null && community.membershipRole != CommunityRole.unknown &&
  (community.type == CommunityType.group || community.membershipRole != CommunityRole.member);

class CommunityAttachmentValidation {
  static const maxCount = 4;
  static const maxImageBytes = 10 * 1024 * 1024;
  static const maxPdfBytes = 20 * 1024 * 1024;
  static const maxTotalBytes = 40 * 1024 * 1024;
  static bool isAllowed(String mimeType) => const {'image/jpeg', 'image/png', 'image/webp', 'application/pdf'}.contains(mimeType);
}
