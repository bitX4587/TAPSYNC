# TapSync Mobile App

React Native mobile app built with Expo, expo-router, and React Query.

## Architecture

```
src/
  app/              # Expo Router file-based routing
  features/         # Feature modules
    auth/           # Authentication and token storage
    nfc/            # NFC reading and writing
  lib/              # Shared utilities
    api.ts          # API client with token refresh interceptor
  state/            # State management
    query-client.ts # React Query configuration
```

## Key Technologies

- **Expo SDK 52** with development client (not Expo Go)
- **expo-router** for file-based routing with typed routes
- **react-native-nfc-manager** for NFC card reading and writing
- **expo-secure-store** for secure token storage
- **@tanstack/react-query** for server state management
- **zustand** for UI state management

## NFC Support

### iOS
- Requires iPhone 7 or newer with iOS 13+
- Automatic tag reading on iPhone XS/XR and newer
- Older iPhones need NFC reader app or Control Center tile
- Writing requires `NFCReaderUsageDescription` in Info.plist
- Requires NFC Tag Reading capability and entitlements

### Android
- Requires NFC hardware and `android.permission.NFC`
- NFC must be enabled in device settings
- Tag reading and writing supported on all NFC-enabled devices

## Custom URL Scheme

The app registers the `tapsync://` URL scheme for deep linking:
- `tapsync://c/{publicId}` - Save profile to My Network
- `tapsync://p/{customName}` - Save profile by custom name

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Expo CLI
- iOS: Xcode and CocoaPods (for iOS development)
- Android: Android Studio and Android SDK (for Android development)

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run on iOS (requires Mac)
pnpm ios

# Run on Android
pnpm android
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_SITE_URL=https://tapsync.app
EXPO_PUBLIC_ANDROID_PACKAGE=app.tapsync.mobile
EXPO_PUBLIC_IOS_BUNDLE_ID=app.tapsync.mobile
```

## API Client

The API client (`src/lib/api.ts`) provides:

- Automatic token refresh on 401 responses
- Secure token storage using expo-secure-store
- Request/response interceptors
- Type-safe API methods
- Error handling with ApiError class

### Usage

```typescript
import { api } from '@/lib/api';

// GET request
const profile = await api.get('/user/me');

// POST request
const result = await api.post('/links', { title: 'LinkedIn', url: 'https://...' });

// PATCH request
await api.patch('/user/me', { fullName: 'John Doe' });

// DELETE request
await api.delete('/links/123');
```

## NFC Service

The NFC service (`src/features/nfc/nfc.service.ts`) provides:

- Device capability checking (isSupported, isEnabled)
- NTAG215 card writing with verification
- Timeout handling
- Error mapping to user-friendly codes

### Usage

```typescript
import { nfcService } from '@/features/nfc';

// Check support
const supported = await nfcService.isSupported();
const enabled = await nfcService.isEnabled();

// Write profile URL to card
try {
  const { uid } = await nfcService.writeProfileUrl(
    'https://tapsync.app/c/abc123',
    { timeoutMs: 20000 }
  );
  console.log('Card written successfully:', uid);
} catch (error) {
  if (error instanceof NfcError) {
    // Handle specific error codes:
    // TIMEOUT, TAG_LOST, NOT_WRITABLE, TOO_SMALL,
    // VERIFY_FAILED, USER_CANCELLED, UNKNOWN
    console.error('NFC error:', error.code, error.message);
  }
}

// Cancel operation
await nfcService.cancel();
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Building

The app uses EAS Build for production builds:

```bash
# Build for iOS (requires EAS account)
eas build --platform ios

# Build for Android
eas build --platform android

# Build both platforms
eas build --platform all
```

## Project Structure Notes

- **Development client required**: This app uses native modules (react-native-nfc-manager) that are not available in Expo Go. Use a development client or build the app.
- **Typed routes**: The app uses expo-router's experimental typed routes feature for type-safe navigation.
- **Monorepo**: This app is part of a pnpm workspace with shared types in `packages/shared`.

## Next Steps

Task 17 onwards will implement:
- Authentication screens (anonymous account, restore, security)
- Dashboard and mode toggle
- Link management UI
- NFC card programming UI
- Analytics screen
- My Network (saved contacts)
