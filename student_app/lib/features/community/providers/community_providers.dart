import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../main.dart';
import '../data/community_api_service.dart';
import '../data/community_models.dart';

final communityApiProvider = Provider<CommunityApiService>((ref) => CommunityApiService(ref.read(dioProvider)));

final myCommunitiesProvider = FutureProvider.autoDispose<List<Community>>((ref) => ref.read(communityApiProvider).mine());
final publicCommunitiesProvider = FutureProvider.autoDispose<List<Community>>((ref) => ref.read(communityApiProvider).discover());
final communityDetailProvider = FutureProvider.autoDispose.family<Community, String>((ref, id) => ref.read(communityApiProvider).getCommunity(id));
