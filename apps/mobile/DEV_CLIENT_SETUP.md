# Development Client Setup Guide

This mobile app is configured to use **Expo Development Client**, NOT Expo Go. This is required because the app uses native modules like `react-native-nfc-manager` that aren't available in Expo Go.

## Prerequisites

- Node.js >=  20
- pnpm >= 9
- For iOS: macOS with Xcode and CocoaPods
- For Android: Android Studio with Android SDK

## Initial Setup

```bash
# Install dependencies from root
cd ../..
pnpm install

# Or from mobile directory
pnpm install
```

## Development Build

### Option 1: Local Development Build

For iOS (requires Mac):
```bash
pnpm ios
```

For Android:
```bash
pnpm android
```

These commands will:
1. Install native dependencies
2. Build a development client
3. Install it on your device/simulator
4. Start the Metro bundler

### Option 2: EAS Build (Cloud)

Build a development client using EAS Build:

```bash
# Install EAS CLI globally (first time only)
npm install -g eas-cli

# Log in to your Expo account
eas login

# Configure project (first time only)
eas build:configure

# Build development client for iOS
eas build --profile development --platform ios

# Build development client for Android
eas build --profile development --platform android
```

The development profile in `eas.json` is configured to:
- Build a development client with debugging enabled
- Create an internal distribution build
- Include iOS simulator builds for testing

## Running the App

After installing the development client:

```bash
# Start the development server
pnpm dev

# The app will automatically connect to the dev server
# Scan the QR code with the development client app
```

## Key Configuration Files

- **app.config.ts**: Expo configuration with NFC permissions
- **eas.json**: EAS Build profiles for development, preview, and production
- **package.json**: Dependencies and scripts
- **.env.example**: Environment variables template

## NFC Configuration

### iOS
- NFC is supported on iPhone 7 and newer
- Requires `NFCReaderUsageDescription` in Info.plist (already configured)
- Requires NFC Tag Reading entitlement (already configured)
- Real device required (NFC doesn't work in simulator)

### Android
- Requires NFC hardware
- Requires `android.permission.NFC` permission (already configured)
- Real device required (NFC doesn't work in emulator)

## File-Based Routing

The app uses **expo-router** for file-based routing with typed routes:

```
src/app/
  _layout.tsx              # Root layout with React Query
  index.tsx                # Entry redirect
  (tabs)/                  # Tab navigation group
    _layout.tsx            # Tab bar layout
    home.tsx               # Dashboard
    links.tsx              # Link management
    card.tsx               # NFC card programming
    network.tsx            # My Network (saved contacts)
    analytics.tsx          # Analytics
    profile.tsx            # Profile & settings
  c/[publicId].tsx         # Deep link: tapsync://c/{publicId}
  p/[name].tsx             # Deep link: tapsync://p/{customName}
```

## Troubleshooting

### Metro bundler errors
```bash
# Clear cache
pnpm dev --clear
```

### Build errors
```bash
# Clean and rebuild
rm -rf node_modules .expo
pnpm install
pnpm ios --clean  # or pnpm android --clean
```

### NFC not working
- Ensure you're using a real device (not simulator/emulator)
- Check that NFC is enabled in device settings
- Verify permissions are granted in app settings

## Next Steps

- Task 16.2: Implement NFC service and hooks
- Task 17: Authentication screens
- Task 18: Dashboard and mode toggle
- Task 19: Link management UI
- Task 20: Card programming UI
- Task 21: Analytics screen

## Resources

- [Expo Development Client Docs](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo Router Docs](https://docs.expo.dev/router/introduction/)
- [React Native NFC Manager](https://github.com/revtel/react-native-nfc-manager)
- [EAS Build](https://docs.expo.dev/build/introduction/)
