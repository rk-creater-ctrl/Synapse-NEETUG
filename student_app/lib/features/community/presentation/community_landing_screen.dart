import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/community_models.dart';
import '../providers/community_providers.dart';

class CommunitiesScreen extends ConsumerWidget {
  const CommunitiesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(title: const Text('Communities'), bottom: const TabBar(tabs: [Tab(text: 'My communities'), Tab(text: 'Discover')])),
      body: const TabBarView(children: [_MyCommunities(), _DiscoverCommunities()]),
    ),
  );
}

class _MyCommunities extends ConsumerWidget {
  const _MyCommunities();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final communities = ref.watch(myCommunitiesProvider);
    return communities.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => Center(child: TextButton(onPressed: () => ref.invalidate(myCommunitiesProvider), child: const Text('Unable to load communities. Retry'))),
      data: (items) => RefreshIndicator(
        onRefresh: () async { ref.invalidate(myCommunitiesProvider); await ref.read(myCommunitiesProvider.future); },
        child: items.isEmpty ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('You have not joined any communities yet.'))]) : ListView.builder(
          padding: const EdgeInsets.all(12), itemCount: items.length, itemBuilder: (_, index) => _communityTile(context, items[index]),
        ),
      ),
    );
  }
}

class _DiscoverCommunities extends ConsumerWidget {
  const _DiscoverCommunities();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final communities = ref.watch(publicCommunitiesProvider);
    return communities.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => Center(child: TextButton(onPressed: () => ref.invalidate(publicCommunitiesProvider), child: const Text('Unable to discover communities. Retry'))),
      data: (items) => RefreshIndicator(
        onRefresh: () async { ref.invalidate(publicCommunitiesProvider); await ref.read(publicCommunitiesProvider.future); },
        child: items.isEmpty ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('No public communities are available.'))]) : ListView.builder(
          padding: const EdgeInsets.all(12), itemCount: items.length,
          itemBuilder: (_, index) => _DiscoverTile(community: items[index]),
        ),
      ),
    );
  }
}

class _DiscoverTile extends ConsumerStatefulWidget {
  final Community community;
  const _DiscoverTile({required this.community});
  @override
  ConsumerState<_DiscoverTile> createState() => _DiscoverTileState();
}

class _DiscoverTileState extends ConsumerState<_DiscoverTile> {
  bool _joining = false;
  Future<void> _join() async {
    if (_joining) return;
    setState(() => _joining = true);
    try {
      await ref.read(communityApiProvider).join(widget.community.id);
      ref.invalidate(myCommunitiesProvider);
      ref.invalidate(publicCommunitiesProvider);
      if (mounted) context.push('/communities/${widget.community.id}');
    } on DioException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_message(error))));
    } finally { if (mounted) setState(() => _joining = false); }
  }
  @override
  Widget build(BuildContext context) {
    final community = widget.community;
    final joined = community.membershipRole != null;
    final canJoin = !joined && community.type == CommunityType.group && community.visibility == CommunityVisibility.public;
    final canOpen = mayOpenDiscoveredCommunity(community);
    return Card(child: ListTile(
      title: Text(community.name), subtitle: Text([community.typeLabel, community.visibilityLabel, if (community.description?.isNotEmpty == true) community.description!].join('\n')),
      isThreeLine: community.description?.isNotEmpty == true,
      trailing: joined ? const Icon(Icons.check) : canJoin ? FilledButton(onPressed: _joining ? null : _join, child: Text(_joining ? 'Joining...' : 'Join')) : null,
      onTap: canOpen ? () => context.push('/communities/${community.id}') : null,
    ));
  }
}

Widget _communityTile(BuildContext context, Community community) => Card(child: ListTile(
  title: Text(community.name), subtitle: Text('${community.typeLabel} · ${community.visibilityLabel}${community.membershipRole == null ? '' : '\n${community.membershipRole!.name.toUpperCase()}'}'),
  trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/communities/${community.id}'),
));

String _message(DioException error) {
  final data = error.response?.data;
  return data is Map && data['message'] is String ? data['message'] as String : 'The community action could not be completed.';
}
