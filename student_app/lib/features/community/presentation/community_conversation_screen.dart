import 'dart:async';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../data/community_api_service.dart';
import '../data/community_models.dart';
import '../data/community_socket_service.dart';
import '../providers/community_providers.dart';

class CommunityConversationScreen extends ConsumerStatefulWidget {
  final String communityId;
  const CommunityConversationScreen({super.key, required this.communityId});
  @override
  ConsumerState<CommunityConversationScreen> createState() => _CommunityConversationScreenState();
}

class _CommunityConversationScreenState extends ConsumerState<CommunityConversationScreen> {
  final _composer = TextEditingController();
  final _storage = const FlutterSecureStorage();
  CommunitySocketService? _socket;
  Community? _community;
  List<CommunityMessage> _messages = [];
  List<CommunityUploadAttachment> _attachments = [];
  CommunityMessage? _replyTo;
  String? _nextCursor;
  bool _loading = true;
  bool _loadingOlder = false;
  bool _sending = false;
  bool _muted = false;
  String? _error;

  CommunityApiService get _api => ref.read(communityApiProvider);
  bool get _canPublish => _community != null && mayPublishInCommunity(_community!, muted: _muted);

  @override
  void initState() { super.initState(); unawaited(_load(initial: true)); }

  Future<void> _load({bool initial = false}) async {
    if (initial) setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([_api.getCommunity(widget.communityId), _api.history(widget.communityId)]);
      final community = results[0] as Community;
      final page = results[1] as CommunityMessagePage;
      if (!mounted) return;
      setState(() {
        _community = community;
        _messages = mergeCommunityMessages(_messages, page.items);
        _nextCursor = page.nextCursor;
        _muted = false;
      });
      await _connectSocket();
    } on DioException catch (error) {
      if (mounted) setState(() => _error = _apiMessage(error));
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to load this community.');
    } finally { if (mounted && initial) setState(() => _loading = false); }
  }

  Future<void> _connectSocket() async {
    _socket ??= CommunitySocketService(
      baseUrl: _api.dio.options.baseUrl, storage: _storage,
      onMessage: (message) { if (mounted) setState(() => _messages = mergeCommunityMessages(_messages, [message])); },
      onReaction: (messageId, reactions) { if (mounted) setState(() => _messages = applyCommunityReaction(_messages, messageId, reactions)); },
      onDeleted: (messageId) { if (mounted) setState(() { _messages = redactCommunityMessage(_messages, messageId); if (_replyTo?.id == messageId) _replyTo = null; }); },
      onMemberModerated: (_, __) => unawaited(_refreshAfterModeration()),
      onReconnected: () => unawaited(_reloadNewestHistory()),
    );
    await _socket!.connectAndJoin(widget.communityId);
  }

  Future<void> _reloadNewestHistory() async {
    try {
      final page = await _api.history(widget.communityId);
      if (mounted) setState(() { _messages = mergeCommunityMessages(_messages, page.items); _nextCursor = page.nextCursor; });
    } catch (_) {}
  }

  Future<void> _refreshAfterModeration() async {
    try {
      final community = await _api.getCommunity(widget.communityId);
      if (mounted) setState(() { _community = community; _muted = false; });
      if (community.membershipRole == null) await _socket?.leave();
    } catch (_) {
      if (mounted) setState(() { _community = null; _muted = true; _error = 'Your access to this community has changed.'; });
    }
  }

  Future<void> _loadOlder() async {
    final cursor = _nextCursor;
    if (cursor == null || _loadingOlder) return;
    setState(() => _loadingOlder = true);
    try {
      final page = await _api.history(widget.communityId, cursor: cursor);
      if (mounted) setState(() { _messages = mergeCommunityMessages(_messages, page.items); _nextCursor = page.nextCursor; });
    } on DioException catch (error) { _show(_apiMessage(error)); }
    finally { if (mounted) setState(() => _loadingOlder = false); }
  }

  Future<void> _send() async {
    final content = _composer.text.trim();
    if (_sending || !_canPublish || (content.isEmpty && _attachments.isEmpty)) return;
    setState(() => _sending = true);
    try {
      CommunityMessage message;
      if (_attachments.isNotEmpty) {
        message = await _api.sendAttachments(widget.communityId, _attachments, content: content.isEmpty ? null : content, replyToMessageId: _replyTo?.id);
      } else {
        message = await _socket?.send(content, replyToMessageId: _replyTo?.id) ?? await _api.sendText(widget.communityId, content, replyToMessageId: _replyTo?.id);
      }
      if (!mounted) return;
      setState(() { _messages = mergeCommunityMessages(_messages, [message]); _attachments = []; _replyTo = null; });
      _composer.clear();
    } on FormatException catch (error) { _show(error.message); }
    on DioException catch (error) { _handlePublishError(error); }
    catch (_) { _show('Unable to send this message.'); }
    finally { if (mounted) setState(() => _sending = false); }
  }

  Future<void> _pickAttachments() async {
    try {
      final picked = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'], allowMultiple: true, withData: false);
      if (picked == null) return;
      final attachments = picked.files.map((file) {
        final path = file.path;
        if (path == null) throw const FormatException('This selected attachment is unavailable.');
        return CommunityUploadAttachment(path: path, fileName: file.name, mimeType: _mimeType(file.name), sizeBytes: file.size);
      }).toList();
      _api.validateAttachments(attachments);
      if (mounted) setState(() => _attachments = attachments);
    } on FormatException catch (error) { _show(error.message); }
    catch (_) { _show('Unable to select attachments.'); }
  }

  Future<void> _react(CommunityMessage message, CommunityReactionType type) async {
    if (!_canPublish || message.isDeleted) return;
    try {
      final result = await _api.toggleReaction(widget.communityId, message.id, type);
      if (mounted) setState(() => _messages = _messages.map((item) => item.id == message.id ? item.copyWith(reactions: result.reactions, myReaction: result.myReaction, clearMyReaction: result.myReaction == null) : item).toList());
    } on DioException catch (error) { _handlePublishError(error); }
  }

  Future<void> _report(CommunityMessage message) async {
    final result = await showDialog<_ReportDraft>(context: context, builder: (_) => const _ReportDialog());
    if (result == null) return;
    try { await _api.report(widget.communityId, message.id, result.reason, details: result.details); _show('Report submitted.'); }
    on DioException catch (error) { _show(_apiMessage(error)); }
  }

  Future<void> _leave() async {
    try {
      await _api.leave(widget.communityId);
      await _socket?.leave();
      ref.invalidate(myCommunitiesProvider);
      ref.invalidate(publicCommunitiesProvider);
      if (mounted) context.pop();
    } on DioException catch (error) { _show(_apiMessage(error)); }
  }

  void _handlePublishError(DioException error) {
    final code = error.response?.data is Map ? (error.response!.data as Map)['code']?.toString() : null;
    if (code == 'COMMUNITY_MEMBERSHIP_MUTED') setState(() => _muted = true);
    if (code == 'COMMUNITY_MESSAGE_PUBLISH_FORBIDDEN' || code == 'COMMUNITY_REACTION_NOT_ALLOWED') unawaited(_refreshAfterModeration());
    _show(_apiMessage(error));
  }
  void _show(String text) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text))); }
  String _apiMessage(DioException error) { final data = error.response?.data; return data is Map && data['message'] is String ? data['message'] as String : 'The community request could not be completed.'; }
  String _mimeType(String name) { final ext = name.split('.').last.toLowerCase(); return switch (ext) {'jpg' || 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'pdf' => 'application/pdf', _ => 'application/octet-stream'}; }

  @override
  void dispose() { unawaited(_socket?.leave() ?? Future<void>.value()); _socket?.dispose(); _composer.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_error != null && _community == null) return Scaffold(appBar: AppBar(title: const Text('Community')), body: Center(child: TextButton(onPressed: () => _load(initial: true), child: Text('$_error Retry'))));
    final community = _community;
    if (community == null) return const Scaffold(body: Center(child: Text('Community unavailable.')));
    return Scaffold(
      appBar: AppBar(title: Text(community.name), actions: [IconButton(onPressed: _loadOlder, icon: const Icon(Icons.refresh)), TextButton(onPressed: _leave, child: const Text('Leave'))]),
      body: Column(children: [
        Padding(padding: const EdgeInsets.all(8), child: Text('${community.typeLabel} · ${community.visibilityLabel}${community.membershipRole == null ? '' : ' · ${community.membershipRole!.name.toUpperCase()}'}')),
        Expanded(child: _messages.isEmpty ? const Center(child: Text('No messages yet.')) : ListView.builder(
          padding: const EdgeInsets.all(12), itemCount: _messages.length + (_nextCursor == null ? 0 : 1),
          itemBuilder: (_, index) => index == 0 && _nextCursor != null ? TextButton(onPressed: _loadingOlder ? null : _loadOlder, child: Text(_loadingOlder ? 'Loading...' : 'Load older messages')) : _MessageCard(
            message: _messages[index - (_nextCursor == null ? 0 : 1)], canPublish: _canPublish, onReply: (message) => setState(() => _replyTo = message), onReact: _react, onReport: _report, onOpenAttachment: (attachment) async { try { await _api.openAttachment(attachment); } catch (_) { _show('Unable to open attachment.'); } },
          ),
        )),
        if (_replyTo != null) ListTile(title: Text('Replying to ${_replyTo!.author.displayName}'), subtitle: Text(_replyTo!.content ?? 'Deleted message'), trailing: IconButton(onPressed: () => setState(() => _replyTo = null), icon: const Icon(Icons.close))),
        if (_attachments.isNotEmpty) Padding(padding: const EdgeInsets.all(8), child: Wrap(spacing: 6, children: _attachments.map((file) => Chip(label: Text(file.fileName), onDeleted: () => setState(() => _attachments.remove(file)))).toList())),
        if (!_canPublish) const Padding(padding: EdgeInsets.all(8), child: Text('You can read this community, but publishing is currently unavailable.')),
        SafeArea(child: Row(children: [IconButton(onPressed: _canPublish ? _pickAttachments : null, icon: const Icon(Icons.attach_file)), Expanded(child: TextField(controller: _composer, enabled: _canPublish, minLines: 1, maxLines: 4, decoration: const InputDecoration(hintText: 'Write a message'))), IconButton(onPressed: _canPublish && !_sending ? _send : null, icon: const Icon(Icons.send))])),
      ]),
    );
  }
}

class _MessageCard extends StatelessWidget {
  final CommunityMessage message; final bool canPublish; final ValueChanged<CommunityMessage> onReply; final Future<void> Function(CommunityMessage, CommunityReactionType) onReact; final Future<void> Function(CommunityMessage) onReport; final Future<void> Function(CommunityAttachment) onOpenAttachment;
  const _MessageCard({required this.message, required this.canPublish, required this.onReply, required this.onReact, required this.onReport, required this.onOpenAttachment});
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message.author.displayName,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            if (message.replyTo != null)
              Text(
                message.replyTo!.isDeleted
                    ? 'Reply to deleted message'
                    : 'Reply to ${message.replyTo!.author.displayName}: '
                        '${message.replyTo!.content ?? ''}',
                style: const TextStyle(fontStyle: FontStyle.italic),
              ),
            const SizedBox(height: 4),
            if (message.isDeleted)
              const Text('This message was deleted.')
            else ...[
              if (message.content?.isNotEmpty == true) Text(message.content!),
              ...message.attachments.map(
                (attachment) => TextButton.icon(
                  onPressed: () => onOpenAttachment(attachment),
                  icon: Icon(
                    attachment.type == CommunityAttachmentType.document
                        ? Icons.picture_as_pdf
                        : Icons.image,
                  ),
                  label: Text(attachment.fileName),
                ),
              ),
              Wrap(
                spacing: 4,
                children: message.reactions
                    .map((reaction) => Chip(
                          label: Text('${reaction.type.name} ${reaction.count}'),
                        ))
                    .toList(),
              ),
              Wrap(
                children: [
                  if (canPublish)
                    ...CommunityReactionType.values
                        .where((type) => type != CommunityReactionType.unknown)
                        .map(
                          (type) => TextButton(
                            onPressed: () => onReact(message, type),
                            child: Text(type.name),
                          ),
                        ),
                  if (canPublish)
                    TextButton(
                      onPressed: () => onReply(message),
                      child: const Text('Reply'),
                    ),
                  TextButton(
                    onPressed: () => onReport(message),
                    child: const Text('Report'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReportDraft { final CommunityReportReason reason; final String? details; const _ReportDraft(this.reason, this.details); }
class _ReportDialog extends StatefulWidget { const _ReportDialog(); @override State<_ReportDialog> createState() => _ReportDialogState(); }
class _ReportDialogState extends State<_ReportDialog> { CommunityReportReason _reason = CommunityReportReason.spam; final _details = TextEditingController(); @override void dispose() { _details.dispose(); super.dispose(); } @override Widget build(BuildContext context) => AlertDialog(title: const Text('Report message'), content: Column(mainAxisSize: MainAxisSize.min, children: [DropdownButtonFormField<CommunityReportReason>(initialValue: _reason, items: CommunityReportReason.values.where((reason) => reason != CommunityReportReason.unknown).map((reason) => DropdownMenuItem(value: reason, child: Text(reason.name))).toList(), onChanged: (value) { if (value != null) setState(() => _reason = value); }), TextField(controller: _details, maxLength: 1000, maxLines: 3, decoration: const InputDecoration(labelText: 'Details (optional)'))]), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(context, _ReportDraft(_reason, _details.text.trim().isEmpty ? null : _details.text.trim())), child: const Text('Submit'))]); }
