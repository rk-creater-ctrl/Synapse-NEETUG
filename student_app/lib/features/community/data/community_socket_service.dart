import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'community_models.dart';

class CommunitySocketService {
  final String baseUrl;
  final FlutterSecureStorage storage;
  final void Function(CommunityMessage message) onMessage;
  final void Function(String messageId, List<CommunityReactionSummary> reactions) onReaction;
  final void Function(String messageId) onDeleted;
  final void Function(String userId, String action) onMemberModerated;
  final void Function() onReconnected;
  io.Socket? _socket;
  String? _communityId;

  CommunitySocketService({required this.baseUrl, required this.storage, required this.onMessage, required this.onReaction, required this.onDeleted, required this.onMemberModerated, required this.onReconnected});

  Future<bool> connectAndJoin(String communityId) async {
    _communityId = communityId;
    final token = await storage.read(key: 'access');
    if (token == null) return false;
    final socket = _socket;
    if (socket == null) {
      final next = io.io('${Uri.parse(baseUrl).origin}/community', io.OptionBuilder()
        .setTransports(['websocket'])
        .setAuth({'token': token})
        .enableReconnection()
        .setReconnectionAttempts(5)
        .setReconnectionDelay(500)
        .setReconnectionDelayMax(4000)
        .disableAutoConnect()
        .build());
      _socket = next;
      _register(next);
      next.connect();
    }
    return _joinWhenConnected(communityId);
  }

  Future<CommunityMessage?> send(String content, {String? replyToMessageId}) async {
    final socket = _socket;
    final communityId = _communityId;
    if (socket == null || communityId == null || !socket.connected) return null;
    final response = await socket.emitWithAckAsync('community:message:send', {
      'communityId': communityId,
      'content': content,
      if (replyToMessageId != null) 'replyToMessageId': replyToMessageId,
    });
    final map = _map(response);
    if (map['ok'] != true) return null;
    final data = _map(map['data']);
    return data.isEmpty ? null : CommunityMessage.fromJson(data);
  }

  Future<void> leave() async {
    final socket = _socket;
    final communityId = _communityId;
    if (socket?.connected == true && communityId != null) {
      socket!.emit('community:leave', {'communityId': communityId});
    }
    _communityId = null;
  }

  void dispose() {
    _communityId = null;
    _socket?.dispose();
    _socket = null;
  }

  void _register(io.Socket socket) {
    socket.onConnect((_) { final id = _communityId; if (id != null) unawaited(_joinWhenConnected(id).then((joined) { if (joined) onReconnected(); })); });
    socket.on('community:message:new', (payload) { final map = _map(payload); if (map['communityId']?.toString() == _communityId) onMessage(CommunityMessage.fromJson(map)); });
    socket.on('community:message:reaction', (payload) {
      final map = _map(payload);
      if (map['communityId']?.toString() != _communityId) return;
      final reactions = (map['reactions'] as List? ?? const []).whereType<Map>().map((item) => CommunityReactionSummary.fromJson(Map<String, dynamic>.from(item))).toList();
      onReaction(map['messageId']?.toString() ?? '', reactions);
    });
    socket.on('community:message:deleted', (payload) { final map = _map(payload); if (map['communityId']?.toString() == _communityId) onDeleted(map['messageId']?.toString() ?? ''); });
    socket.on('community:member:moderated', (payload) { final map = _map(payload); if (map['communityId']?.toString() == _communityId) onMemberModerated(map['userId']?.toString() ?? '', map['action']?.toString() ?? ''); });
  }

  Future<bool> _joinWhenConnected(String communityId) async {
    final socket = _socket;
    if (socket == null) return false;
    if (!socket.connected) {
      final completer = Completer<void>();
      void connected(_) { if (!completer.isCompleted) completer.complete(); }
      socket.once('connect', connected);
      try { await completer.future.timeout(const Duration(seconds: 10)); } catch (_) { return false; }
    }
    try {
      final response = await socket.emitWithAckAsync('community:join', {'communityId': communityId}).timeout(const Duration(seconds: 10));
      return _map(response)['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  Map<String, dynamic> _map(Object? value) => value is Map ? Map<String, dynamic>.from(value) : const {};
}
