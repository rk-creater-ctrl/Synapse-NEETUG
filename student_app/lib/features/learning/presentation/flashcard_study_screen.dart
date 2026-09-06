import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/learning_models.dart';
import '../providers/learning_providers.dart';

class FlashcardStudyScreen extends ConsumerStatefulWidget {
  final String topicId;

  const FlashcardStudyScreen({super.key, required this.topicId});

  @override
  ConsumerState<FlashcardStudyScreen> createState() =>
      _FlashcardStudyScreenState();
}

class _FlashcardStudyScreenState extends ConsumerState<FlashcardStudyScreen> {
  bool _isRevealed = false;
  bool _isLoading = true;
  bool _isSubmitting = false;
  int _index = 0;
  List<Flashcard> _cards = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final cards = await ref
          .read(learningApiProvider)
          .flashcards(widget.topicId);
      if (!mounted) {
        return;
      }
      setState(() {
        _cards = cards;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _error = 'Unable to load flashcards.';
        _isLoading = false;
      });
    }
  }

  Future<void> _review(String result) async {
    if (_isSubmitting || _index >= _cards.length) {
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      await ref
          .read(learningApiProvider)
          .reviewFlashcard(_cards[_index].id, result);
      if (!mounted) {
        return;
      }
      setState(() {
        _index += 1;
        _isRevealed = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _error = 'Unable to save review.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text(_error!)),
      );
    }

    if (_cards.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Flashcards')),
        body: const Center(child: Text('No flashcards available.')),
      );
    }

    if (_index >= _cards.length) {
      return Scaffold(
        appBar: AppBar(title: const Text('Flashcards')),
        body: const Center(child: Text('Session complete.')),
      );
    }

    final card = _cards[_index];
    return Scaffold(
      appBar: AppBar(title: Text('${_index + 1} / ${_cards.length}')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Expanded(
              child: Card(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      _isRevealed ? card.backContent : card.frontContent,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 20),
                    ),
                  ),
                ),
              ),
            ),
            if (!_isRevealed)
              FilledButton(
                onPressed: () {
                  setState(() {
                    _isRevealed = true;
                  });
                },
                child: const Text('Reveal answer'),
              )
            else
              Column(
                children: [
                  if (card.explanation != null) Text(card.explanation!),
                  Wrap(
                    spacing: 8,
                    children: ['AGAIN', 'HARD', 'GOOD', 'EASY']
                        .map(
                          (result) => FilledButton(
                            onPressed: _isSubmitting
                                ? null
                                : () => _review(result),
                            child: Text(result),
                          ),
                        )
                        .toList(),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
