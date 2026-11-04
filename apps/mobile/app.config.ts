import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'TapSync',
  slug: 'tapsync',
  version: '1.0.0',
  orientation: 'portrait',
  platforms: ['ios', 'android'],

  // Custom URL scheme for deep links: tapsync://c/{publicId}
  scheme: 'tapsync',

  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },

  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.tapsync.mobile',
    infoPlist: {
      // Required for CoreNFC tag reading
      NFCReaderUsageDescription:
        'TapSync reads and writes NFC cards to program and scan digital business cards.',
    },
    entitlements: {
      // NFC Tag Reading entitlement
      'com.apple.developer.nfc.readersession.formats': ['NDEF'],
    },
  },

  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'app.tapsync.mobile',
    permissions: ['android.permission.NFC'],
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-sqlite',
      {
        enableFTS: false,
      },
    ],
    [
      'react-native-nfc-manager',
      {
        nfcPermission:
          'TapSync reads and writes NFC cards to program and scan digital business cards.',
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    eas: {
      projectId: 'a0c52f89-8bec-4482-83f2-26f399b678c1',
    },
  },
};

export default config;