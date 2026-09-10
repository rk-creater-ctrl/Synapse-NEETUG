import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import 'core/device/installation_identity_service.dart';
import 'features/learning/presentation/chapter_learning_screen.dart';
import 'features/learning/presentation/qbank_browse_screen.dart';
import 'features/learning/presentation/qbank_history_screen.dart';
import 'features/learning/presentation/qbank_question_detail_screen.dart';
import 'features/learning/presentation/qbank_practice_screen.dart';
import 'features/learning/presentation/test_screens.dart';

const _storage = FlutterSecureStorage();
final _installationIdentityService = InstallationIdentityService();

final dioProvider = Provider<Dio>((ref) => ApiClient().dio);

Future<void> _storeSession(Map<String, dynamic> data) async {
  final accessToken = data['accessToken'] as String?;
  final refreshToken = data['refreshToken'] as String?;

  if (accessToken == null || refreshToken == null) {
    throw const FormatException('Invalid authentication response');
  }

  await _storage.write(key: 'access', value: accessToken);
  await _storage.write(key: 'refresh', value: refreshToken);
  authState.setAuthenticated(true);
}

class AuthState extends ChangeNotifier {
  bool ready = false;
  bool authenticated = false;

  Future<void> bootstrap() async {
    authenticated = await _storage.read(key: 'refresh') != null;
    ready = true;
    notifyListeners();
  }

  void setAuthenticated(bool value) {
    authenticated = value;
    notifyListeners();
  }

  Future<void> signOut() async {
    await _storage.delete(key: 'access');
    await _storage.delete(key: 'refresh');
    authenticated = false;
    notifyListeners();
  }
}

final authState = AuthState();

class ApiClient {
  final Dio dio = Dio(
    BaseOptions(
      baseUrl: const String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://10.0.2.2:3000/api/v1',
      ),
    ),
  );

  Future<String?>? _refreshFuture;

  ApiClient() {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: 'access');

          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          handler.next(options);
        },
        onError: (error, handler) async {
          final request = error.requestOptions;

          if (error.response?.statusCode != 401 ||
              request.extra['retried'] == true ||
              request.path.contains('/auth/refresh')) {
            return handler.next(error);
          }

          try {
            _refreshFuture ??= _renewToken();

            final token = await _refreshFuture;

            if (token == null) {
              throw Exception('Refresh failed');
            }

            request.extra['retried'] = true;
            request.headers['Authorization'] = 'Bearer $token';

            final response = await dio.fetch(request);
            return handler.resolve(response);
          } catch (_) {
            await authState.signOut();
            return handler.next(error);
          } finally {
            _refreshFuture = null;
          }
        },
      ),
    );
  }

  Future<String?> _renewToken() async {
    final refreshToken = await _storage.read(key: 'refresh');

    if (refreshToken == null) {
      return null;
    }

    final refreshDio = Dio();

    final response = await refreshDio.post(
      '${dio.options.baseUrl}/auth/refresh',
      data: {
        'refreshToken': refreshToken,
      },
    );

    final accessToken = response.data['accessToken'] as String?;
    final nextRefreshToken = response.data['refreshToken'] as String?;

    if (accessToken == null || nextRefreshToken == null) {
      return null;
    }

    await _storage.write(
      key: 'access',
      value: accessToken,
    );

    await _storage.write(
      key: 'refresh',
      value: nextRefreshToken,
    );

    authState.setAuthenticated(true);

    return accessToken;
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await authState.bootstrap();

  runApp(
    const ProviderScope(
      child: SynapseApp(),
    ),
  );
}

class SynapseApp extends StatelessWidget {
  const SynapseApp({super.key});

  @override
  Widget build(BuildContext context) {
    final router = GoRouter(
      refreshListenable: authState,
      redirect: (context, state) {
        if (!authState.ready) {
          return state.matchedLocation == '/' ? null : '/';
        }

        if (!authState.authenticated && state.matchedLocation != '/login') {
          return '/login';
        }

        if (authState.authenticated &&
            (state.matchedLocation == '/' ||
                state.matchedLocation == '/login')) {
          return '/home';
        }

        return null;
      },
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Splash(),
        ),
        GoRoute(
          path: '/login',
          builder: (_, __) => const Login(),
        ),
        GoRoute(
          path: '/home',
          builder: (_, __) => const Home(),
        ),
        GoRoute(
          path: '/subjects',
          builder: (_, __) => const Subjects(),
        ),
        GoRoute(
          path: '/profile',
          builder: (_, __) => const Profile(),
        ),
        GoRoute(
          path: '/devices',
          builder: (_, __) => const DeviceManagementScreen(),
        ),
        GoRoute(
          path: '/qbank',
          builder: (_, __) => const QbankBrowseScreen(),
        ),
        GoRoute(
          path: '/qbank/history',
          builder: (_, __) => const QbankHistoryScreen(),
        ),
        GoRoute(
          path: '/qbank/question/:id',
          builder: (_, state) => QbankQuestionDetailScreen(
            questionId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/qbank/session/:id',
          builder: (_, state) => QbankPracticeScreen(
            sessionId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/tests',
          builder: (_, __) => const TestsScreen(),
        ),
        GoRoute(
          path: '/tests/:id',
          builder: (_, state) => TestDetailScreen(
            testId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/test-attempts/:id',
          builder: (_, state) => TestAttemptScreen(
            attemptId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/test-attempts/:id/result',
          builder: (_, state) => TestResultScreen(
            attemptId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/test-attempts/:id/review',
          builder: (_, state) => TestReviewScreen(
            attemptId: state.pathParameters['id']!,
          ),
        ),
      ],
    );

    return MaterialApp.router(
      title: 'Synapse',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xff2251cc),
        useMaterial3: true,
      ),
      darkTheme: ThemeData.dark(
        useMaterial3: true,
      ),
      routerConfig: router,
    );
  }
}

class Splash extends StatefulWidget {
  const Splash({super.key});

  @override
  State<Splash> createState() => _SplashState();
}

class _SplashState extends State<Splash> {
  @override
  void initState() {
    super.initState();
    _redirect();
  }

  Future<void> _redirect() async {
    final refreshToken = await _storage.read(key: 'refresh');

    if (!mounted) {
      return;
    }

    context.go(
      refreshToken == null ? '/login' : '/home',
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: SynapseLoader(),
      ),
    );
  }
}

class Login extends ConsumerStatefulWidget {
  const Login({super.key});

  @override
  ConsumerState<Login> createState() => _LoginState();
}

class _LoginState extends ConsumerState<Login> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _loading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_loading) {
      return;
    }

    setState(() {
      _loading = true;
    });

    try {
      final identity = await _installationIdentityService.getIdentity();
      final response = await ref.read(dioProvider).post(
        '/auth/login',
        data: {
          'email': _emailController.text.trim(),
          'password': _passwordController.text,
          'installationId': identity.installationId,
          'deviceName': identity.deviceName,
          'platform': identity.platform,
        },
      );

      final data = Map<String, dynamic>.from(response.data as Map);
      if (data['code'] == 'DEVICE_APPROVAL_REQUIRED') {
        if (mounted) {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => PendingDeviceApprovalScreen(
                email: _emailController.text.trim(),
                password: _passwordController.text,
                identity: identity,
                pending: PendingDeviceApproval.fromJson(data),
              ),
            ),
          );
        }
        return;
      }

      await _storeSession(data);

      if (mounted) {
        context.go('/home');
      }
    } on DioException catch (error) {
      final data = error.response?.data;
      final code = data is Map ? data['code']?.toString() : null;
      final message = code == 'DEVICE_LIMIT_REACHED'
          ? 'Two devices are already active. Remove an existing device before signing in.'
          : code == 'DEVICE_NOT_APPROVED'
              ? 'This device is not approved. Use your primary device to approve it.'
              : 'Unable to sign in';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
          ),
        );
      }
    } on FormatException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to sign in')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to sign in')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SynapsePage(
      title: 'Welcome back',
      child: Column(
        children: [
          SynapseTextField(
            controller: _emailController,
            label: 'Email',
          ),
          SynapseTextField(
            controller: _passwordController,
            label: 'Password',
            secret: true,
          ),
          SynapseButton(
            label: _loading ? 'Signing in...' : 'Login',
            onPressed: _login,
          ),
        ],
      ),
    );
  }
}

class Home extends StatelessWidget {
  const Home({super.key});

  @override
  Widget build(BuildContext context) {
    return SynapsePage(
      title: 'Your NEET journey',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Learn',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Continue your NEET preparation by subject.',
          ),
          SynapseButton(
            label: 'Browse subjects',
            onPressed: () => context.go('/subjects'),
          ),
          SynapseButton(
            label: 'QBank & PYQs',
            onPressed: () => context.go('/qbank'),
          ),
          SynapseButton(
            label: 'Tests',
            onPressed: () => context.go('/tests'),
          ),
          TextButton(
            onPressed: () => context.push('/profile'),
            child: const Text('Profile'),
          ),
        ],
      ),
    );
  }
}

class Subjects extends ConsumerWidget {
  const Subjects({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SynapsePage(
      title: 'Subjects',
      child: FutureBuilder<Response<dynamic>>(
        future: ref.read(dioProvider).get('/academics/subjects'),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const SynapseErrorState(
              message: 'Unable to load subjects',
            );
          }

          if (!snapshot.hasData) {
            return const SynapseLoader();
          }

          final data = snapshot.data!.data;
          final subjects = (data['data'] as List<dynamic>?) ?? [];

          if (subjects.isEmpty) {
            return const SynapseEmptyState(
              message: 'No subjects available.',
            );
          }

          return ListView(
            children: subjects.map((subject) {
              return SynapseCard(
                child: ListTile(
                  title: Text(subject['name']?.toString() ?? 'Subject'),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => Classes(
                          subjectId: subject['id'].toString(),
                          name: subject['name']?.toString() ?? 'Subject',
                        ),
                      ),
                    );
                  },
                ),
              );
            }).toList(),
          );
        },
      ),
    );
  }
}

class Classes extends ConsumerWidget {
  final String subjectId;
  final String name;

  const Classes({
    super.key,
    required this.subjectId,
    required this.name,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SynapsePage(
      title: name,
      child: FutureBuilder<Response<dynamic>>(
        future: ref.read(dioProvider).get(
          '/academics/classes',
          queryParameters: {
            'subjectId': subjectId,
          },
        ),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const SynapseErrorState(
              message: 'Unable to load classes',
            );
          }

          if (!snapshot.hasData) {
            return const SynapseLoader();
          }

          final data = snapshot.data!.data;
          final classes = (data['data'] as List<dynamic>?) ?? [];

          if (classes.isEmpty) {
            return const SynapseEmptyState(
              message: 'No classes available.',
            );
          }

          return ListView(
            children: classes.map((academicClass) {
              return SynapseCard(
                child: ListTile(
                  title: Text(
                    academicClass['name']?.toString() ?? 'Class',
                  ),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => Chapters(
                          classId: academicClass['id'].toString(),
                          name: academicClass['name']?.toString() ?? 'Class',
                        ),
                      ),
                    );
                  },
                ),
              );
            }).toList(),
          );
        },
      ),
    );
  }
}

class Chapters extends ConsumerWidget {
  final String classId;
  final String name;

  const Chapters({
    super.key,
    required this.classId,
    required this.name,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SynapsePage(
      title: name,
      child: FutureBuilder<Response<dynamic>>(
        future: ref.read(dioProvider).get(
          '/academics/chapters',
          queryParameters: {
            'classId': classId,
          },
        ),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const SynapseErrorState(
              message: 'Unable to load chapters',
            );
          }

          if (!snapshot.hasData) {
            return const SynapseLoader();
          }

          final data = snapshot.data!.data;
          final chapters = (data['data'] as List<dynamic>?) ?? [];

          if (chapters.isEmpty) {
            return const SynapseEmptyState(
              message: 'No chapters available.',
            );
          }

          return ListView(
            children: chapters.map((chapter) {
              return SynapseCard(
                child: ListTile(
                  title: Text(
                    chapter['name']?.toString() ?? 'Chapter',
                  ),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ChapterLearningScreen(
                          chapterId: chapter['id'].toString(),
                          title: chapter['name']?.toString() ?? 'Chapter',
                        ),
                      ),
                    );
                  },
                ),
              );
            }).toList(),
          );
        },
      ),
    );
  }
}

class Profile extends StatelessWidget {
  const Profile({super.key});

  @override
  Widget build(BuildContext context) {
    return SynapsePage(
      title: 'Profile',
      child: Column(
        children: [
          const SynapseCard(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
            'Profile setup is available after registration.',
          ),
            ),
          ),
          SynapseButton(
            label: 'Manage devices',
            onPressed: () => context.push('/devices'),
          ),
          SynapseButton(
            label: 'Logout',
            onPressed: () async {
              await authState.signOut();
              if (context.mounted) {
                context.go('/login');
              }
            },
          ),
        ],
      ),
    );
  }
}

class PendingDeviceApproval {
  final String deviceId;
  final String approvalToken;
  final DateTime? expiresAt;
  final String message;

  const PendingDeviceApproval({
    required this.deviceId,
    required this.approvalToken,
    required this.expiresAt,
    required this.message,
  });

  factory PendingDeviceApproval.fromJson(Map<String, dynamic> json) {
    return PendingDeviceApproval(
      deviceId: json['deviceId']?.toString() ?? '',
      approvalToken: json['approvalToken']?.toString() ?? '',
      expiresAt: DateTime.tryParse(json['expiresAt']?.toString() ?? ''),
      message: json['message']?.toString() ??
          'Approve this device from your primary device before signing in.',
    );
  }
}

class PendingDeviceApprovalScreen extends ConsumerStatefulWidget {
  final String email;
  final String password;
  final InstallationIdentity identity;
  final PendingDeviceApproval pending;

  const PendingDeviceApprovalScreen({
    super.key,
    required this.email,
    required this.password,
    required this.identity,
    required this.pending,
  });

  @override
  ConsumerState<PendingDeviceApprovalScreen> createState() =>
      _PendingDeviceApprovalScreenState();
}

class _PendingDeviceApprovalScreenState
    extends ConsumerState<PendingDeviceApprovalScreen> {
  late PendingDeviceApproval _pending;
  bool _checking = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _pending = widget.pending;
  }

  bool get _expired =>
      _pending.expiresAt != null && _pending.expiresAt!.isBefore(DateTime.now());

  Future<void> _retryLogin() async {
    if (_checking) {
      return;
    }
    setState(() {
      _checking = true;
      _message = null;
    });

    try {
      final response = await ref.read(dioProvider).post(
        '/auth/login',
        data: {
          'email': widget.email,
          'password': widget.password,
          'installationId': widget.identity.installationId,
          'deviceName': widget.identity.deviceName,
          'platform': widget.identity.platform,
        },
      );
      final data = Map<String, dynamic>.from(response.data as Map);
      if (data['code'] == 'DEVICE_APPROVAL_REQUIRED') {
        if (!mounted) {
          return;
        }
        setState(() {
          _pending = PendingDeviceApproval.fromJson(data);
          _message = 'Approval is still pending. Use the latest approval token below.';
        });
        return;
      }

      await _storeSession(data);
      if (mounted) {
        context.go('/home');
      }
    } on DioException catch (error) {
      final data = error.response?.data;
      final code = data is Map ? data['code']?.toString() : null;
      if (!mounted) {
        return;
      }
      setState(() {
        _message = code == 'DEVICE_LIMIT_REACHED'
            ? 'Two devices are already active. Remove an existing device before signing in.'
            : code == 'APPROVAL_EXPIRED'
                ? 'This approval request expired. Try again to request a new approval token.'
                : 'Unable to check device approval.';
      });
    } on FormatException {
      if (mounted) {
        setState(() {
          _message = 'Unable to complete sign in.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _checking = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SynapsePage(
      title: 'Approve this device',
      child: ListView(
        children: [
          Text(_pending.message),
          const SizedBox(height: 16),
          const Text(
            'On your primary device, open Profile → Manage devices and approve this pending device. '
            'The approval token must be transferred manually for the current backend API.',
          ),
          const SizedBox(height: 16),
          const Text('Approval token'),
          SelectableText(_pending.approvalToken),
          const SizedBox(height: 8),
          Text(
            _pending.expiresAt == null
                ? 'This request expires shortly.'
                : _expired
                    ? 'This request has expired. Check approval to request a new token.'
                    : 'Expires: ${_pending.expiresAt!.toLocal()}',
          ),
          if (_message != null) ...[
            const SizedBox(height: 12),
            Text(_message!),
          ],
          SynapseButton(
            label: _checking ? 'Checking...' : 'Check approval',
            onPressed: _checking ? () {} : _retryLogin,
          ),
        ],
      ),
    );
  }
}

class UserDeviceInfo {
  final String id;
  final String installationId;
  final String? deviceName;
  final String? platform;
  final bool isPrimary;
  final bool isApproved;
  final DateTime? revokedAt;

  const UserDeviceInfo({
    required this.id,
    required this.installationId,
    required this.deviceName,
    required this.platform,
    required this.isPrimary,
    required this.isApproved,
    required this.revokedAt,
  });

  factory UserDeviceInfo.fromJson(Map<String, dynamic> json) {
    return UserDeviceInfo(
      id: json['id']?.toString() ?? '',
      installationId: json['installationId']?.toString() ?? '',
      deviceName: json['deviceName']?.toString(),
      platform: json['platform']?.toString(),
      isPrimary: json['isPrimary'] == true,
      isApproved: json['isApproved'] == true,
      revokedAt: DateTime.tryParse(json['revokedAt']?.toString() ?? ''),
    );
  }

  bool get isRevoked => revokedAt != null;
}

class DeviceManagementScreen extends ConsumerStatefulWidget {
  const DeviceManagementScreen({super.key});

  @override
  ConsumerState<DeviceManagementScreen> createState() =>
      _DeviceManagementScreenState();
}

class _DeviceManagementScreenState extends ConsumerState<DeviceManagementScreen> {
  final _approvalTokenController = TextEditingController();
  bool _loading = true;
  bool _working = false;
  String? _error;
  String? _selectedPendingDeviceId;
  String? _currentInstallationId;
  List<UserDeviceInfo> _devices = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _approvalTokenController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final identity = await _installationIdentityService.getIdentity();
      final response = await ref.read(dioProvider).get('/auth/devices');
      final data = response.data as List? ?? [];
      if (!mounted) {
        return;
      }
      setState(() {
        _currentInstallationId = identity.installationId;
        _devices = data
            .map((item) => UserDeviceInfo.fromJson(
                Map<String, dynamic>.from(item as Map)))
            .toList();
      });
    } on DioException catch (error) {
      final data = error.response?.data;
      final code = data is Map ? data['code']?.toString() : null;
      if (mounted) {
        setState(() {
          _error = code == 'DEVICE_NOT_APPROVED'
              ? 'This device is no longer approved. Sign in again after approval.'
              : 'Unable to load devices.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Unable to load devices.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _approve(UserDeviceInfo device) async {
    final approvalToken = _approvalTokenController.text.trim();
    if (approvalToken.isEmpty || _working) {
      return;
    }
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      await ref.read(dioProvider).post(
        '/auth/devices/${device.id}/approve',
        data: {'approvalToken': approvalToken},
      );
      _approvalTokenController.clear();
      if (mounted) {
        setState(() {
          _selectedPendingDeviceId = null;
        });
      }
      await _load();
    } on DioException catch (error) {
      final data = error.response?.data;
      final code = data is Map ? data['code']?.toString() : null;
      if (mounted) {
        setState(() {
          _error = code == 'APPROVAL_EXPIRED'
              ? 'This approval request expired.'
              : code == 'DEVICE_LIMIT_REACHED'
                  ? 'Two approved devices are already active.'
                  : 'Unable to approve this device.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _working = false;
        });
      }
    }
  }

  Future<void> _revoke(UserDeviceInfo device) async {
    if (_working || device.installationId == _currentInstallationId) {
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Revoke device?'),
        content: Text('This will sign out ${device.deviceName ?? 'this device'}.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Revoke'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      return;
    }
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      await ref.read(dioProvider).post('/auth/devices/${device.id}/revoke');
      await _load();
    } on DioException {
      if (mounted) {
        setState(() {
          _error = 'Unable to revoke this device.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _working = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SynapsePage(
        title: 'Manage devices',
        child: SynapseLoader(),
      );
    }
    if (_error != null && _devices.isEmpty) {
      return SynapsePage(
        title: 'Manage devices',
        child: Column(
          children: [
            SynapseErrorState(message: _error!),
            SynapseButton(label: 'Retry', onPressed: _load),
          ],
        ),
      );
    }

    final current = _devices.where(
      (device) => device.installationId == _currentInstallationId,
    );
    final isCurrentPrimary = current.any(
      (device) => device.isPrimary && device.isApproved && !device.isRevoked,
    );
    return SynapsePage(
      title: 'Manage devices',
      child: ListView(
        children: [
          const Text('Devices linked to your account.'),
          if (!isCurrentPrimary)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text('Only your primary device can approve pending devices.'),
            ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!),
          ],
          const SizedBox(height: 12),
          ..._devices.map((device) {
            final isCurrent = device.installationId == _currentInstallationId;
            final isPending = !device.isApproved && !device.isRevoked;
            final isSelected = _selectedPendingDeviceId == device.id;
            return SynapseCard(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(device.deviceName ?? 'Unnamed device'),
                    Text(device.platform ?? 'Unknown platform'),
                    Text(device.isRevoked
                        ? 'Revoked'
                        : device.isApproved
                            ? device.isPrimary
                                ? 'Primary approved device'
                                : 'Approved device'
                            : 'Pending approval'),
                    if (isCurrent) const Text('Current device'),
                    if (isCurrentPrimary && isPending) ...[
                      TextButton(
                        onPressed: _working
                            ? null
                            : () {
                                setState(() {
                                  _selectedPendingDeviceId =
                                      isSelected ? null : device.id;
                                });
                              },
                        child: Text(isSelected ? 'Cancel approval' : 'Approve'),
                      ),
                      if (isSelected) ...[
                        TextField(
                          controller: _approvalTokenController,
                          decoration: const InputDecoration(
                            labelText: 'Approval token from pending device',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        SynapseButton(
                          label: _working ? 'Approving...' : 'Confirm approval',
                          onPressed: _working ? () {} : () => _approve(device),
                        ),
                      ],
                    ],
                    if (!isCurrent && !device.isRevoked)
                      TextButton(
                        onPressed: _working ? null : () => _revoke(device),
                        child: const Text('Revoke device'),
                      ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

class SynapsePage extends StatelessWidget {
  final String title;
  final Widget child;

  const SynapsePage({
    super.key,
    required this.title,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: child,
      ),
    );
  }
}

class SynapseButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;

  const SynapseButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: FilledButton(
        onPressed: onPressed,
        child: Text(label),
      ),
    );
  }
}

class SynapseTextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final bool secret;

  const SynapseTextField({
    super.key,
    required this.controller,
    required this.label,
    this.secret = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        obscureText: secret,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }
}

class SynapseCard extends StatelessWidget {
  final Widget child;

  const SynapseCard({
    super.key,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: child,
    );
  }
}

class SynapseLoader extends StatelessWidget {
  const SynapseLoader({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(),
    );
  }
}

class SynapseEmptyState extends StatelessWidget {
  final String message;

  const SynapseEmptyState({
    super.key,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(message),
    );
  }
}

class SynapseErrorState extends StatelessWidget {
  final String message;

  const SynapseErrorState({
    super.key,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(message),
    );
  }
}
