import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import 'features/learning/presentation/chapter_learning_screen.dart';

const _storage = FlutterSecureStorage();

final dioProvider = Provider<Dio>((ref) => ApiClient().dio);

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
    await _storage.deleteAll();
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
      final response = await ref.read(dioProvider).post(
        '/auth/login',
        data: {
          'email': _emailController.text.trim(),
          'password': _passwordController.text,
        },
      );

      final accessToken = response.data['accessToken'] as String?;
      final refreshToken = response.data['refreshToken'] as String?;

      if (accessToken == null || refreshToken == null) {
        throw Exception('Invalid authentication response');
      }

      await _storage.write(
        key: 'access',
        value: accessToken,
      );

      await _storage.write(
        key: 'refresh',
        value: refreshToken,
      );

      authState.setAuthenticated(true);

      if (mounted) {
        context.go('/home');
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Unable to sign in'),
          ),
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
          TextButton(
            onPressed: () => context.go('/profile'),
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
    return const SynapsePage(
      title: 'Profile',
      child: SynapseCard(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Profile setup is available after registration.',
          ),
        ),
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
