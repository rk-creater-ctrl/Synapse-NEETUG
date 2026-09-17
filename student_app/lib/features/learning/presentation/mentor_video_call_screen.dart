import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:go_router/go_router.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../data/mentor_discovery_models.dart';
import '../providers/learning_providers.dart';

class MentorVideoCallScreen extends ConsumerStatefulWidget {
  final String bookingId;
  const MentorVideoCallScreen({super.key, required this.bookingId});

  @override
  ConsumerState<MentorVideoCallScreen> createState() => _MentorVideoCallScreenState();
}

class _MentorVideoCallScreenState extends ConsumerState<MentorVideoCallScreen> {
  final _localRenderer = RTCVideoRenderer();
  final _remoteRenderer = RTCVideoRenderer();
  final _storage = const FlutterSecureStorage();
  final List<Map<String, dynamic>> _pendingCandidates = [];
  MediaStream? _localStream;
  RTCPeerConnection? _peer;
  io.Socket? _socket;
  Timer? _endTimer;
  Timer? _disconnectGraceTimer;
  bool _joined = false;
  bool _localRendererInitialized = false;
  bool _remoteRendererInitialized = false;
  bool _hasRemoteMedia = false;
  bool _muted = false;
  bool _cameraEnabled = true;
  bool _sessionEnded = false;
  bool _explicitLeave = false;
  bool _recovering = false;
  bool _peerPresent = false;
  int _recoveryAttempts = 0;
  int? _generation;
  int? _peerGeneration;
  int? _rebuildingGeneration;
  Future<void>? _peerRebuild;
  Map<String, dynamic>? _pendingOffer;
  String _state = 'Authorizing session…';
  String? _error;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    await _release(notifyPeer: true, disposeRenderers: false);
    if (!mounted) return;
    _sessionEnded = false;
    _explicitLeave = false;
    _recoveryAttempts = 0;
    _peerPresent = false;
    _peerGeneration = null;
    _rebuildingGeneration = null;
    _peerRebuild = null;
    _pendingOffer = null;
    setState(() { _state = 'Authorizing session…'; _error = null; });
    try {
      final api = ref.read(learningApiProvider);
      final bootstrap = await api.mentorVideoAccess(widget.bookingId);
      final token = await _storage.read(key: 'access');
      if (token == null) throw const _CallException('Unable to authorize this session.');
      await _initializeRenderers();
      if (!mounted) return;
      setState(() => _state = 'Requesting camera and microphone…');
      try {
        _localStream = await navigator.mediaDevices.getUserMedia({
          'audio': true,
          'video': {
            'facingMode': 'user',
            'width': {'ideal': 640},
            'height': {'ideal': 480},
            'frameRate': {'ideal': 20, 'max': 24},
          },
        });
      } catch (_) {
        throw const _CallException('Camera and microphone permission is required.');
      }
      if (_localRendererInitialized) {
        _localRenderer.srcObject = _localStream;
      }
      await _rebuildPeer(bootstrap);
      if (!mounted) return;
      setState(() => _state = 'Connecting…');
      final baseUrl = api.dio.options.baseUrl;
      final socketUrl = '${Uri.parse(baseUrl).origin}/video';
      final socket = io.io(socketUrl, io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionAttempts(5)
          .setReconnectionDelay(500)
          .setReconnectionDelayMax(4000)
          .disableAutoConnect()
          .build());
      _socket = socket;
      _registerSocketListeners(socket, bootstrap);
      socket.connect();
      final remaining = bootstrap.accessExpiresAt.difference(DateTime.now()).inMilliseconds;
      if (remaining <= 0) {
        await _endSession();
      } else {
        _endTimer = Timer(Duration(milliseconds: remaining), () async {
          await _endSession();
        });
      }
    } on DioException catch (error) {
      _fail(_apiErrorMessage(error));
    } on _CallException catch (error) {
      _fail(error.message);
    } catch (_) {
      _fail('Unable to initialize the video call.');
    }
  }

  void _registerSocketListeners(io.Socket socket, MentorVideoAccess bootstrap) {
    socket.onConnect((_) {
      if (!_sessionEnded && !_explicitLeave) {
        socket.emit('video:join', {'bookingId': bootstrap.bookingId});
      }
    });
    socket.onDisconnect((_) {
      unawaited(_recover(bootstrap, rebuildPeer: false));
    });
    socket.onConnectError((_) {
      if (_recoveryAttempts >= 3) _fail('Unable to connect to the signaling service.');
    });
    socket.on('video:joined', (dynamic payload) {
      final message = _map(payload);
      final generation = message['generation'];
      if (_sessionEnded || message['bookingId']?.toString() != bootstrap.bookingId || generation is! int) return;
      _generation = generation;
      _peerGeneration ??= generation;
      _joined = true;
      _recoveryAttempts = 0;
      if (mounted) setState(() => _state = 'Waiting for mentor…');
    });
    socket.on('video:peer-joined', (dynamic payload) async {
      final message = _map(payload);
      final generation = message['generation'];
      if (_sessionEnded || message['bookingId']?.toString() != bootstrap.bookingId || generation is! int) return;
      if (_generation != null && generation < _generation!) return;
      _peerPresent = true;
      _generation = generation;
      await _rebuildForGeneration(bootstrap, generation);
    });
    socket.on('video:offer', (dynamic payload) async {
      final message = _map(payload);
      final offer = _map(message['offer']);
      final generation = message['generation'];
      if (message['bookingId']?.toString() != bootstrap.bookingId || generation is! int || generation != _generation || offer.isEmpty || _sessionEnded || !_peerPresent) return;
      _peerPresent = true;
      if (_peerGeneration != generation || _rebuildingGeneration == generation) {
        _pendingOffer = offer;
        return;
      }
      await _processOffer(socket, bootstrap, generation, offer);
    });
    socket.on('video:answer', (dynamic payload) async {
      final message = _map(payload);
      final answer = _map(message['answer']);
      if (message['bookingId']?.toString() != bootstrap.bookingId || message['generation'] != _generation || answer.isEmpty || _peer == null) return;
      try {
        await _peer!.setRemoteDescription(RTCSessionDescription(answer['sdp']?.toString(), answer['type']?.toString()));
        await _flushCandidates();
      } catch (_) { _fail('Unable to finalize the peer-to-peer connection.'); }
    });
    socket.on('video:ice-candidate', (dynamic payload) async {
      final message = _map(payload);
      final candidate = _map(message['candidate']);
      final generation = message['generation'];
      if (message['bookingId']?.toString() != bootstrap.bookingId || generation is! int || generation != _generation || candidate.isEmpty) return;
      if (_peerGeneration != generation || _rebuildingGeneration == generation || _peer == null) {
        _pendingCandidates.add(candidate);
        return;
      }
      if (await _peer!.getRemoteDescription() == null) {
        _pendingCandidates.add(candidate);
        return;
      }
      await _addCandidate(candidate);
    });
    socket.on('video:peer-left', (dynamic payload) {
      final message = _map(payload);
      if (message['bookingId']?.toString() != bootstrap.bookingId || (message['generation'] is int && message['generation'] != _generation)) return;
      if (_sessionEnded) return;
      _peerPresent = false;
      _pendingOffer = null;
      if (_remoteRendererInitialized) {
        _remoteRenderer.srcObject = null;
      }
      if (mounted) setState(() { _hasRemoteMedia = false; _state = 'Waiting for mentor…'; });
    });
    socket.on('video:session-ended', (dynamic payload) {
      final message = _map(payload);
      if (message['bookingId']?.toString() == bootstrap.bookingId) {
        unawaited(_endSession());
      }
    });
    socket.on('video:error', (dynamic payload) {
      final message = _map(payload);
      final code = message['code']?.toString();
      if (code == 'VIDEO_SIGNAL_STALE' || code == 'VIDEO_SIGNAL_INVALID') {
        if (_peerPresent) unawaited(_recover(bootstrap));
        return;
      }
      if (code == 'VIDEO_CALL_ENDED') {
        unawaited(_endSession());
        return;
      }
      _fail(_signalingErrorMessage(code));
    });
  }

  Future<void> _rebuildPeer(MentorVideoAccess bootstrap) async {
    final previousPeer = _peer;
    _peer = null;
    await previousPeer?.close();
    _pendingCandidates.clear();
    if (_remoteRendererInitialized) _remoteRenderer.srcObject = null;
    if (mounted) setState(() => _hasRemoteMedia = false);
    final stream = _localStream;
    if (stream == null || stream.getTracks().isEmpty) {
      throw const _CallException('Camera and microphone are unavailable.');
    }
    final peer = await createPeerConnection(_peerConfiguration());
    _peer = peer;
    for (final track in stream.getTracks()) {
      await peer.addTrack(track, stream);
    }
    peer.onTrack = (event) {
      if (_sessionEnded || event.streams.isEmpty) return;
      if (_remoteRendererInitialized) _remoteRenderer.srcObject = event.streams.first;
      if (mounted) setState(() { _hasRemoteMedia = true; _state = 'Connected'; });
    };
    peer.onIceCandidate = (candidate) {
      if (candidate.candidate != null && _peerPresent && _socket?.connected == true && _generation != null) {
        _socket!.emit('video:ice-candidate', {'bookingId': bootstrap.bookingId, 'generation': _generation, 'candidate': candidate.toMap()});
      }
    };
    peer.onConnectionState = (state) {
      if (!mounted || _sessionEnded || _explicitLeave || !identical(_peer, peer)) return;
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _disconnectGraceTimer?.cancel();
        _disconnectGraceTimer = null;
        _recoveryAttempts = 0;
        setState(() => _state = 'Connected');
      } else if (_peerPresent && state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        _disconnectGraceTimer ??= Timer(const Duration(seconds: 4), () => unawaited(_recover(bootstrap)));
      } else if (_peerPresent && state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        unawaited(_recover(bootstrap));
      }
    };
  }

  Future<void> _rebuildForGeneration(MentorVideoAccess bootstrap, int generation) async {
    if (_peerGeneration == generation && _rebuildingGeneration == null) return;
    if (_rebuildingGeneration == generation && _peerRebuild != null) {
      await _peerRebuild;
      return;
    }
    _peerGeneration = null;
    _rebuildingGeneration = generation;
    final rebuild = _rebuildPeer(bootstrap);
    _peerRebuild = rebuild;
    try {
      await rebuild;
      if (_sessionEnded || _generation != generation) return;
      _peerGeneration = generation;
      final pendingOffer = _pendingOffer;
      _pendingOffer = null;
      if (_peerPresent && pendingOffer != null) {
        final socket = _socket;
        if (socket != null) await _processOffer(socket, bootstrap, generation, pendingOffer);
      }
    } finally {
      if (_rebuildingGeneration == generation) {
        _rebuildingGeneration = null;
        _peerRebuild = null;
      }
    }
  }

  Future<void> _processOffer(io.Socket socket, MentorVideoAccess bootstrap, int generation, Map<String, dynamic> offer) async {
    final peer = _peer;
    if (_sessionEnded || !_peerPresent || _generation != generation || _peerGeneration != generation || peer == null) return;
    try {
      await peer.setRemoteDescription(RTCSessionDescription(offer['sdp']?.toString(), offer['type']?.toString()));
      await _flushCandidates();
      final answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      if (!_sessionEnded && _generation == generation && _peerGeneration == generation && socket.connected) {
        socket.emit('video:answer', {'bookingId': bootstrap.bookingId, 'generation': generation, 'answer': answer.toMap()});
      }
    } catch (_) {
      _fail('Unable to negotiate the peer-to-peer connection.');
    }
  }

  Future<void> _recover(MentorVideoAccess bootstrap, {bool rebuildPeer = true}) async {
    if (_sessionEnded || _explicitLeave || _recovering) return;
    if (rebuildPeer && !_peerPresent) return;
    if (_recoveryAttempts >= 3) {
      _fail('Connection lost. Please retry the call.');
      return;
    }
    _recovering = true;
    _disconnectGraceTimer?.cancel();
    _disconnectGraceTimer = null;
    _recoveryAttempts += 1;
    _joined = false;
    if (mounted) setState(() => _state = 'Reconnectingâ€¦');
    try {
      if (rebuildPeer) await _rebuildPeer(bootstrap);
      if (rebuildPeer) _peerGeneration = _generation;
      if (_socket?.connected == true) {
        _socket!.emit('video:join', {'bookingId': bootstrap.bookingId});
      } else {
        _socket?.connect();
      }
    } catch (_) {
      _fail('Unable to restore the peer-to-peer connection.');
    } finally {
      _recovering = false;
    }
  }

  Future<void> _flushCandidates() async {
    final candidates = List<Map<String, dynamic>>.from(_pendingCandidates);
    _pendingCandidates.clear();
    for (final candidate in candidates) {
      await _addCandidate(candidate);
    }
  }

  Future<void> _initializeRenderers() async {
    if (!_localRendererInitialized) {
      await _localRenderer.initialize();
      _localRendererInitialized = true;
    }
    if (!_remoteRendererInitialized) {
      await _remoteRenderer.initialize();
      _remoteRendererInitialized = true;
    }
  }

  Future<void> _addCandidate(Map<String, dynamic> candidate) async {
    final index = candidate['sdpMLineIndex'];
    await _peer?.addCandidate(RTCIceCandidate(candidate['candidate']?.toString(), candidate['sdpMid']?.toString(), index is int ? index : int.tryParse(index?.toString() ?? '')));
  }

  Map<String, dynamic> _peerConfiguration() {
    const stunUrl = String.fromEnvironment('WEBRTC_STUN_URL');
    return stunUrl.isEmpty ? {} : {'iceServers': [{'urls': stunUrl}]};
  }

  Map<String, dynamic> _map(dynamic value) => value is Map ? Map<String, dynamic>.from(value) : const {};

  String _apiErrorMessage(DioException error) {
    final data = error.response?.data;
    final code = data is Map ? data['code']?.toString() : null;
    return _signalingErrorMessage(code);
  }

  String _signalingErrorMessage(String? code) => switch (code) {
    'VIDEO_CALL_TOO_EARLY' => 'Call access is not open yet.',
    'VIDEO_CALL_BOOKING_NOT_CONFIRMED' => 'This booking must be confirmed before joining.',
    'VIDEO_CALL_ENDED' => 'This session has ended.',
    'MENTOR_BOOKING_NOT_FOUND' => 'Booking not found or you do not have access.',
    _ => 'Unable to connect.',
  };

  void _fail(String message) {
    if (_sessionEnded) return;
    _explicitLeave = true;
    unawaited(_release(notifyPeer: true, disposeRenderers: false));
    if (mounted) setState(() { _state = 'Unable to connect'; _error = message; });
  }

  Future<void> _endSession() async {
    if (_sessionEnded) return;
    _sessionEnded = true;
    await _release(notifyPeer: false, disposeRenderers: false);
    if (mounted) {
      setState(() {
        _state = 'Session ended';
        _error = 'This mentor session has ended.';
      });
    }
  }

  Future<void> _release({required bool notifyPeer, required bool disposeRenderers}) async {
    _endTimer?.cancel();
    _endTimer = null;
    _disconnectGraceTimer?.cancel();
    _disconnectGraceTimer = null;
    final socket = _socket;
    if (notifyPeer && socket?.connected == true && _joined) socket!.emit('video:leave', {'bookingId': widget.bookingId});
    _joined = false;
    _socket = null;
    socket?.dispose();
    await _peer?.close();
    _peer = null;
    for (final track in _localStream?.getTracks() ?? const <MediaStreamTrack>[]) {
      track.stop();
    }
    await _localStream?.dispose();
    _localStream = null;
    if (_localRendererInitialized) {
      _localRenderer.srcObject = null;
    }
    if (_remoteRendererInitialized) {
      _remoteRenderer.srcObject = null;
    }
    _pendingCandidates.clear();
    _pendingOffer = null;
    _generation = null;
    _peerGeneration = null;
    _rebuildingGeneration = null;
    _peerRebuild = null;
    _recovering = false;
    _peerPresent = false;
    _hasRemoteMedia = false;
    if (disposeRenderers && _localRendererInitialized) {
      await _localRenderer.dispose();
      _localRendererInitialized = false;
    }
    if (disposeRenderers && _remoteRendererInitialized) {
      await _remoteRenderer.dispose();
      _remoteRendererInitialized = false;
    }
  }

  @override
  void dispose() {
    _explicitLeave = true;
    unawaited(_release(notifyPeer: true, disposeRenderers: true));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Mentor call')),
    body: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(_state),
        const SizedBox(height: 12),
        Expanded(child: Container(color: Colors.black, child: _hasRemoteMedia ? RTCVideoView(_remoteRenderer) : const Center(child: Text('Waiting for mentor…', style: TextStyle(color: Colors.white))))),
        const SizedBox(height: 12),
        SizedBox(height: 160, child: RTCVideoView(_localRenderer, mirror: true)),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.red))),
        if (_state == 'Unable to connect') TextButton(onPressed: _initialize, child: const Text('Retry')),
        Wrap(spacing: 8, children: [
          FilledButton.tonal(onPressed: _sessionEnded || _localStream == null ? null : _toggleMute, child: Text(_muted ? 'Unmute microphone' : 'Mute microphone')),
          FilledButton.tonal(onPressed: _sessionEnded || _localStream == null ? null : _toggleCamera, child: Text(_cameraEnabled ? 'Turn camera off' : 'Turn camera on')),
          FilledButton.tonal(onPressed: () { _explicitLeave = true; unawaited(_release(notifyPeer: true, disposeRenderers: false)); context.pop(); }, child: const Text('Leave call')),
        ]),
      ]),
    ),
  );

  void _toggleMute() {
    final next = !_muted;
    for (final track in _localStream?.getAudioTracks() ?? const <MediaStreamTrack>[]) { track.enabled = !next; }
    setState(() => _muted = next);
  }

  void _toggleCamera() {
    final next = !_cameraEnabled;
    for (final track in _localStream?.getVideoTracks() ?? const <MediaStreamTrack>[]) { track.enabled = next; }
    setState(() => _cameraEnabled = next);
  }
}

class _CallException implements Exception {
  final String message;
  const _CallException(this.message);
}
