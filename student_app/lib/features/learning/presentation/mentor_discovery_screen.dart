import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/mentor_discovery_models.dart';
import '../providers/learning_providers.dart';

class MentorDiscoveryScreen extends ConsumerStatefulWidget {
  const MentorDiscoveryScreen({super.key});

  @override
  ConsumerState<MentorDiscoveryScreen> createState() => _MentorDiscoveryScreenState();
}

class _MentorDiscoveryScreenState extends ConsumerState<MentorDiscoveryScreen> {
  MentorDiscoveryFilters _filters = const MentorDiscoveryFilters();
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _applyFilters({String? subjectId, bool updateSubject = false}) {
    setState(() {
      _filters = MentorDiscoveryFilters(
        subjectId: updateSubject ? subjectId : _filters.subjectId,
        search: _searchController.text.trim().isEmpty ? null : _searchController.text.trim(),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final mentors = ref.watch(mentorDiscoveryProvider(_filters));
    final subjects = ref.watch(mentorSubjectsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mentors'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(mentorDiscoveryProvider(_filters)),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          _filterCard(subjects),
          Expanded(
            child: mentors.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => Center(
                child: TextButton(
                  onPressed: () => ref.invalidate(mentorDiscoveryProvider(_filters)),
                  child: const Text('Unable to load mentors. Retry'),
                ),
              ),
              data: (items) => RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(mentorDiscoveryProvider(_filters));
                  await ref.read(mentorDiscoveryProvider(_filters).future);
                },
                child: items.isEmpty
                    ? ListView(children: const [
                        Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('No active mentors match these filters.'),
                        ),
                      ])
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        itemCount: items.length,
                        itemBuilder: (context, index) => _mentorCard(items[index]),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterCard(AsyncValue<List<MentorDiscoverySubject>> subjects) => Card(
        margin: const EdgeInsets.all(16),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  labelText: 'Search mentor name',
                  suffixIcon: IconButton(
                    tooltip: 'Search',
                    onPressed: _applyFilters,
                    icon: const Icon(Icons.search),
                  ),
                ),
                onSubmitted: (_) => _applyFilters(),
              ),
              const SizedBox(height: 8),
              subjects.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Subject filters are unavailable.'),
                data: (items) => DropdownButtonFormField<String?>(
                  initialValue: _filters.subjectId,
                  decoration: const InputDecoration(labelText: 'Subject'),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('All subjects')),
                    ...items.map((subject) => DropdownMenuItem<String?>(
                          value: subject.id,
                          child: Text(subject.name),
                        )),
                  ],
                  onChanged: (value) => _applyFilters(subjectId: value, updateSubject: true),
                ),
              ),
            ],
          ),
        ),
      );

  Widget _mentorCard(StudentMentor mentor) => Card(
        child: ListTile(
          title: Text(mentor.fullName),
          subtitle: Text(_summary(mentor)),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/mentors/${mentor.id}'),
        ),
      );

  String _summary(StudentMentor mentor) {
    final parts = <String>[];
    if (mentor.headline?.isNotEmpty == true) parts.add(mentor.headline!);
    parts.add('${mentor.experienceYears} years experience');
    if (mentor.subjects.isNotEmpty) {
      parts.add(mentor.subjects.map((subject) => subject.name).join(', '));
    }
    return parts.join('\n');
  }
}
