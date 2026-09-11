import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/study_session_models.dart';
import '../providers/learning_providers.dart';

class StudyTimerScreen extends ConsumerStatefulWidget {
  const StudyTimerScreen({super.key});

  @override
  ConsumerState<StudyTimerScreen> createState() => _StudyTimerScreenState();
}

class _StudyTimerScreenState extends ConsumerState<StudyTimerScreen>
    with WidgetsBindingObserver {
  Timer? _ticker;
  int _displayBaseSeconds = 0;
  DateTime? _displaySyncedAt;
  bool _working = false;
  StudySessionContextType _contextType = StudySessionContextType.general;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(studySessionProvider.notifier).loadCurrent();
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<StudySession?>>(studySessionProvider, (_, next) {
      if (next is AsyncData<StudySession?>) {
        _syncTicker(next.value);
      }
    });
    final state = ref.watch(studySessionProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Study Timer'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _working
                ? null
                : () => ref.read(studySessionProvider.notifier).loadCurrent(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _body(state),
    );
  }

  Widget _body(AsyncValue<StudySession?> state) {
    if (state is AsyncData<StudySession?>) {
      final session = state.value;
      if (session == null) {
        return _idle();
      }
      return _session(session);
    }
    if (state is AsyncError<StudySession?>) {
      return Center(
        child: TextButton(
          onPressed: () => ref.read(studySessionProvider.notifier).loadCurrent(),
          child: const Text('Unable to load Study Timer. Retry'),
        ),
      );
    }
    return const Center(child: CircularProgressIndicator());
  }

  Widget _idle() => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('00:00:00', style: TextStyle(fontSize: 40, fontWeight: FontWeight.bold)),
          const SizedBox(height: 20),
          DropdownButtonFormField<StudySessionContextType>(
            key: ValueKey(_contextType),
            initialValue: _contextType,
            decoration: const InputDecoration(labelText: 'Study context'),
            items: StudySessionContextType.values
                .where((context) => context != StudySessionContextType.unknown)
                .map((context) => DropdownMenuItem(
                      value: context,
                      child: Text(context.label),
                    ))
                .toList(),
            onChanged: _working
                ? null
                : (context) {
                    if (context != null) {
                      setState(() => _contextType = context);
                    }
                  },
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _working ? null : _start,
            child: Text(_working ? 'Starting...' : 'Start'),
          ),
        ],
      );

  Widget _session(StudySession session) {
    if (session.status == StudySessionStatus.completed) {
      return _finalized(
        title: 'Session completed',
        duration: session.finalDurationSeconds ?? session.currentDurationSeconds,
        completed: true,
      );
    }
    if (session.status == StudySessionStatus.abandoned) {
      return _finalized(
        title: 'Session abandoned',
        duration: null,
        completed: false,
      );
    }

    final isPaused = session.status == StudySessionStatus.paused;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(_formatDuration(_displaySeconds(session)),
            style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(session.contextType.label),
        Text(session.status.label),
        if (session.hierarchy.label.isNotEmpty) Text(session.hierarchy.label),
        const SizedBox(height: 20),
        if (isPaused)
          FilledButton(
            onPressed: _working ? null : () => _mutate(() => ref.read(studySessionProvider.notifier).resume(session.id)),
            child: Text(_working ? 'Saving...' : 'Resume'),
          )
        else
          FilledButton(
            onPressed: _working ? null : () => _mutate(() => ref.read(studySessionProvider.notifier).pause(session.id)),
            child: Text(_working ? 'Saving...' : 'Pause'),
          ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _working ? null : () => _mutate(() => ref.read(studySessionProvider.notifier).complete(session.id)),
          child: const Text('Complete'),
        ),
        TextButton(
          onPressed: _working ? null : () => _confirmAbandon(session.id),
          child: const Text('Abandon'),
        ),
      ],
    );
  }

  Widget _finalized({
    required String title,
    required int? duration,
    required bool completed,
  }) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            if (completed && duration != null) ...[
              const SizedBox(height: 8),
              Text('Study time: ${_formatDuration(duration)}'),
            ],
            if (!completed)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('This session was not counted as completed study time.'),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => ref.read(studySessionProvider.notifier).clearFinalized(),
              child: const Text('Start a new session'),
            ),
          ],
        ),
      );

  Future<void> _start() => _mutate(
        () => ref.read(studySessionProvider.notifier).start(
              StudySessionStartContext(contextType: _contextType),
            ),
      );

  Future<void> _confirmAbandon(String sessionId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Abandon session?'),
        content: const Text('The session will be kept as abandoned and not counted as completed study time.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Abandon'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await _mutate(() => ref.read(studySessionProvider.notifier).abandon(sessionId));
    }
  }

  Future<void> _mutate(Future<void> Function() mutation) async {
    if (_working) {
      return;
    }
    setState(() => _working = true);
    try {
      await mutation();
    } on DioException catch (error) {
      final data = error.response?.data;
      final code = data is Map ? data['code']?.toString() : null;
      if (code == 'STUDY_SESSION_ALREADY_ACTIVE') {
        await ref.read(studySessionProvider.notifier).loadCurrent();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(code == 'STUDY_SESSION_ALREADY_ACTIVE'
              ? 'An active study session already exists.'
              : 'Unable to update Study Timer. Please try again.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to update Study Timer. Please try again.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _working = false);
      }
    }
  }

  void _syncTicker(StudySession? session) {
    _ticker?.cancel();
    _ticker = null;
    _displayBaseSeconds = session?.currentDurationSeconds ?? 0;
    _displaySyncedAt = DateTime.now();
    if (session?.status == StudySessionStatus.inProgress) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) {
          setState(() {});
        }
      });
    }
    if (mounted) {
      setState(() {});
    }
  }

  int _displaySeconds(StudySession session) {
    if (session.status != StudySessionStatus.inProgress || _displaySyncedAt == null) {
      return session.currentDurationSeconds;
    }
    return _displayBaseSeconds + DateTime.now().difference(_displaySyncedAt!).inSeconds;
  }
}

String _formatDuration(int seconds) {
  final safeSeconds = seconds < 0 ? 0 : seconds;
  final hours = safeSeconds ~/ 3600;
  final minutes = (safeSeconds % 3600) ~/ 60;
  final remainder = safeSeconds % 60;
  return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${remainder.toString().padLeft(2, '0')}';
}
