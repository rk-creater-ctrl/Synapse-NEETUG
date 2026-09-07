import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class InstallationIdentity {
  final String installationId;
  final String deviceName;
  final String platform;

  const InstallationIdentity({
    required this.installationId,
    required this.deviceName,
    required this.platform,
  });
}

class InstallationIdentityService {
  static const _installationIdKey = 'installation_id';

  final FlutterSecureStorage _storage;
  final Random _random;

  InstallationIdentityService({
    FlutterSecureStorage? storage,
    Random? random,
  })  : _storage = storage ?? const FlutterSecureStorage(),
        _random = random ?? Random.secure();

  Future<InstallationIdentity> getIdentity() async {
    var installationId = await _storage.read(key: _installationIdKey);
    if (installationId == null || installationId.length < 16) {
      installationId = _newInstallationId();
      await _storage.write(key: _installationIdKey, value: installationId);
    }

    final platform = _platformName();
    final deviceName = '${_platformLabel(platform)} device';
    return InstallationIdentity(
      installationId: installationId,
      deviceName: deviceName,
      platform: platform,
    );
  }

  String _newInstallationId() {
    final bytes = List<int>.generate(32, (_) => _random.nextInt(256));
    return base64UrlEncode(bytes).replaceAll('=', '');
  }

  String _platformLabel(String platform) {
    if (platform == 'android') {
      return 'Android';
    }
    if (platform == 'ios') {
      return 'iOS';
    }
    return platform;
  }

  String _platformName() {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'android';
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.windows:
        return 'windows';
      case TargetPlatform.macOS:
        return 'macos';
      case TargetPlatform.linux:
        return 'linux';
      case TargetPlatform.fuchsia:
        return 'fuchsia';
    }
  }
}
