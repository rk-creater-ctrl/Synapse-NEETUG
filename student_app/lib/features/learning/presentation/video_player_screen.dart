import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../data/learning_models.dart';
import '../providers/learning_providers.dart';

class LearningVideoPlayer extends ConsumerStatefulWidget {
  final LearningVideo video;

  const LearningVideoPlayer({
    super.key,
    required this.video,
  });

  @override
  ConsumerState<LearningVideoPlayer> createState() =>
      _LearningVideoPlayerState();
}

class _LearningVideoPlayerState extends ConsumerState<LearningVideoPlayer>
    with WidgetsBindingObserver {
  VideoPlayerController? _player;
  Timer? _syncTimer;

  int _watchedSeconds = 0;
  int _lastPositionSeconds = 0;

  bool _syncing = false;
  bool _queuedSync = false;
  bool _completedSyncSent = false;

  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadVideo();
  }

  Future<void> _loadVideo() async {
    try {
      final api = ref.read(learningApiProvider);

      final playback = await api.playback(widget.video.id);
      final progress = await api.progress(widget.video.id);

      if (!mounted) {
        return;
      }

      if (playback.playbackUrl == null ||
          playback.playbackUrl!.trim().isEmpty) {
        throw Exception('Playback is unavailable');
      }

      final controller = VideoPlayerController.networkUrl(
        Uri.parse(playback.playbackUrl!),
      );

      await controller.initialize();

      if (!mounted) {
        await controller.dispose();
        return;
      }

      final durationSeconds = controller.value.duration.inSeconds;

      final shouldResume = !progress.completed &&
          progress.lastPositionSeconds > 0 &&
          durationSeconds > 0 &&
          durationSeconds - progress.lastPositionSeconds > 5;

      if (shouldResume) {
        await controller.seekTo(
          Duration(seconds: progress.lastPositionSeconds),
        );
      }

      controller.addListener(_trackPlayback);

      setState(() {
        _player = controller;
        _watchedSeconds = progress.watchedSeconds;
        _lastPositionSeconds = controller.value.position.inSeconds;
      });

      _syncTimer = Timer.periodic(
        const Duration(seconds: 25),
        (_) => _syncProgress(),
      );
    } on DioException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = error.response?.statusCode == 403
            ? 'This lesson requires premium access.'
            : 'Unable to load this lesson.';
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = 'Unable to initialize video playback.';
      });
    }
  }

  void _trackPlayback() {
    final player = _player;

    if (player == null || !player.value.isInitialized) {
      return;
    }

    final currentSeconds = player.value.position.inSeconds;
    final delta = currentSeconds - _lastPositionSeconds;

    // Credit only small, natural forward playback increments.
    // Large forward jumps are treated as seeking and are not counted.
    if (player.value.isPlaying && delta > 0 && delta <= 3) {
      _watchedSeconds += delta;
    }

    _lastPositionSeconds = currentSeconds;

    final duration = player.value.duration;

    if (!_completedSyncSent &&
        duration != Duration.zero &&
        player.value.position >= duration) {
      _completedSyncSent = true;
      unawaited(_syncProgress());
    }

    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _syncProgress() async {
    final player = _player;

    if (player == null || !player.value.isInitialized) {
      return;
    }

    if (_syncing) {
      _queuedSync = true;
      return;
    }

    final positionSeconds = player.value.position.inSeconds;
    final watchedSeconds = _watchedSeconds;

    _syncing = true;

    try {
      final api = ref.read(learningApiProvider);

      await api.sync(
        widget.video.id,
        positionSeconds,
        watchedSeconds,
      );
    } catch (_) {
      // Progress sync failure should not interrupt playback.
    } finally {
      _syncing = false;

      if (_queuedSync) {
        _queuedSync = false;
        unawaited(_syncProgress());
      }
    }
  }

  Future<void> _togglePlayback() async {
    final player = _player;

    if (player == null) {
      return;
    }

    if (player.value.isPlaying) {
      await player.pause();
      await _syncProgress();
    } else {
      await player.play();
    }

    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _toggleSpeed() async {
    final player = _player;

    if (player == null) {
      return;
    }

    final nextSpeed = player.value.playbackSpeed == 1.0 ? 1.5 : 1.0;

    await player.setPlaybackSpeed(nextSpeed);

    if (mounted) {
      setState(() {});
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      unawaited(_player?.pause());
      unawaited(_syncProgress());
    }
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);

    final player = _player;

    if (player != null && player.value.isInitialized) {
      unawaited(_syncProgress());
      player.removeListener(_trackPlayback);
      unawaited(player.dispose());
    }

    super.dispose();
  }

  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');

    if (duration.inHours > 0) {
      final hours = duration.inHours.toString().padLeft(2, '0');
      return '$hours:$minutes:$seconds';
    }

    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(
          title: Text(widget.video.title),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              _error!,
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final player = _player;

    if (player == null || !player.value.isInitialized) {
      return Scaffold(
        appBar: AppBar(
          title: Text(widget.video.title),
        ),
        body: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    final duration = player.value.duration;
    final position = player.value.position;

    final maxMilliseconds =
        duration.inMilliseconds > 0 ? duration.inMilliseconds.toDouble() : 1.0;

    final sliderValue =
        position.inMilliseconds.toDouble().clamp(0.0, maxMilliseconds);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.video.title),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AspectRatio(
            aspectRatio: player.value.aspectRatio > 0
                ? player.value.aspectRatio
                : 16 / 9,
            child: VideoPlayer(player),
          ),
          const SizedBox(height: 16),
          Slider(
            value: sliderValue,
            max: maxMilliseconds,
            onChanged: (value) {
              player.seekTo(
                Duration(milliseconds: value.toInt()),
              );
            },
          ),
          Row(
            children: [
              IconButton(
                icon: Icon(
                  player.value.isPlaying ? Icons.pause : Icons.play_arrow,
                ),
                onPressed: _togglePlayback,
              ),
              Text(
                '${_formatDuration(position)} / '
                '${_formatDuration(duration)}',
              ),
              const Spacer(),
              TextButton(
                onPressed: _toggleSpeed,
                child: Text(
                  '${player.value.playbackSpeed}x',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
