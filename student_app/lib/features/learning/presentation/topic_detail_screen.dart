import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/learning_providers.dart';
import 'video_player_screen.dart';
import 'flashcard_study_screen.dart';

class TopicDetailScreen extends ConsumerWidget {
  final String topicId;
  final String title;
  final int flashcardCount;

  const TopicDetailScreen({
    super.key,
    required this.topicId,
    required this.title,
    this.flashcardCount = 0,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final videos = ref.watch(topicVideosProvider(topicId));
    final revisions = ref.watch(topicRevisionProvider(topicId));

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Video lessons',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          videos.when(
            data: (items) {
              if (items.isEmpty) {
                return const Text('No lessons available.');
              }

              return Column(
                children: items
                    .map(
                      (video) => Card(
                        child: ListTile(
                          title: Text(video.title),
                          subtitle: Text(
                            '${video.instructorName ?? 'Synapse'} - '
                            '${video.durationSeconds ?? 0}s - '
                            '${video.isFree ? 'Free' : 'Premium'}',
                          ),
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => LearningVideoPlayer(
                                  video: video,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    )
                    .toList(),
              );
            },
            error: (_, __) => const Text(
              'Unable to load lessons.',
            ),
            loading: () => const Center(
              child: CircularProgressIndicator(),
            ),
          ),
          const SizedBox(height: 24),
          if (flashcardCount > 0) ...[
            Text('Flashcards ($flashcardCount)',style:const TextStyle(fontSize:20,fontWeight:FontWeight.bold)),
            const SizedBox(height: 8),
            FilledButton(onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>FlashcardStudyScreen(topicId:topicId))),child:const Text('Study Flashcards')),
          ],
          const SizedBox(height: 24),
          const Text(
            'Revision',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          revisions.when(
            data: (items) {
              if (items.isEmpty) {
                return const Text('No revision available.');
              }

              return Column(
                children: items
                    .map(
                      (revision) => Card(
                        child: ListTile(
                          title: Text(revision.title),
                          subtitle: Text(
                            revision.type.replaceAll('_', ' '),
                          ),
                          onTap: () {
                            showDialog<void>(
                              context: context,
                              builder: (_) => AlertDialog(
                                title: Text(revision.title),
                                content: SingleChildScrollView(
                                  child: Text(revision.content),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    )
                    .toList(),
              );
            },
            error: (_, __) => const Text(
              'Unable to load revision.',
            ),
            loading: () => const Center(
              child: CircularProgressIndicator(),
            ),
          ),
        ],
      ),
    );
  }
}
