import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/learning_providers.dart';
import 'topic_detail_screen.dart';

class ChapterLearningScreen extends ConsumerWidget {
  final String chapterId;
  final String title;

  const ChapterLearningScreen({
    super.key,
    required this.chapterId,
    required this.title,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final topics = ref.watch(chapterTopicsProvider(chapterId));

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
      ),
      body: topics.when(
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Text('No learning content yet.'),
            );
          }

          return ListView(
            children: items
                .map(
                  (topic) => Card(
                    child: ListTile(
                      title: Text(topic.name),
                      subtitle: Text(
                        '${topic.videoCount} videos - '
                        '${topic.revisionCount} revision items - '
                        '${topic.flashcardCount} flashcards',
                      ),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => TopicDetailScreen(
                              topicId: topic.id,
                              title: topic.name,
                              flashcardCount: topic.flashcardCount,
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
        error: (_, __) => const Center(
          child: Text('Unable to load chapter learning.'),
        ),
        loading: () => const Center(
          child: CircularProgressIndicator(),
        ),
      ),
    );
  }
}
