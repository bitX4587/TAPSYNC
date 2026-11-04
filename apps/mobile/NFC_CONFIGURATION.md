# NFC Configuration for TapSync Mobile

## Package Installation

- **Package**: `react-native-nfc-manager` v3.14.14+ (currently v3.17.5)
- **Status**: ✅ Installed and configured

## Configuration Summary

All NFC configuration has been completed in `app.config.ts`:

1. **Expo Config Plugin**: Added `react-native-nfc-manager` to the plugins array
2. **iOS Configuration**: NFCReaderUsageDescription and NDEF entitlements configured
3. **Android Configuration**: NFC permission configured

## iOS Configuration

### Requirements
- iPhone 7+ with iOS 13+
- NFC Tag Reading capability

### Configuration in `app.config.ts`

#### Info.plist Entry
```typescript
infoPlist: {
  NFCReaderUsageDescription:
    'TapSync reads and writes NFC cards to program and scan digital business cards.',
}
```

This permission description will be shown to users when the app requests NFC access.

#### Entitlements
```typescript
entitlements: {
  'com.apple.developer.nfc.readersession.formats': ['NDEF'],
}
```

This entitlement enables NDEF (NFC Data Exchange Format) tag reading and writing.

#### Config Plugin
```typescript
plugins: [
  // ... other plugins
  [
    'react-native-nfc-manager',
    {
      nfcPermission:
        'TapSync reads and writes NFC cards to program and scan digital business cards.',
    },
  ],
]
```

The config plugin automatically applies the iOS entitlements and Info.plist entries during the build process.

### Additional iOS Setup Required

When building for device or App Store:
1. Enable "Near Field Communication Tag Reading" capability in Xcode (automatically done by EAS Build)
2. The entitlement file will be automatically generated during `expo prebuild` or EAS Build
3. For development builds, ensure your Apple Developer account has NFC capability enabled

## Android Configuration

### Requirements
- NFC hardware support
- Android 4.4+ (API level 19+)

### Configuration in `app.config.ts`

#### Permissions
```typescript
android: {
  permissions: ['android.permission.NFC'],
}
```

This permission allows the app to use NFC hardware.

### Build Output

The NFC permission will be automatically added to `AndroidManifest.xml` during build:
```xml
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

Note: `android:required="false"` allows installation on devices without NFC, but the app will detect and disable NFC features at runtime using `NfcManager.isSupported()`.

## NFC Service Interface

The NFC service will implement the following interface (from design.md):

```typescript
type NfcWriteState =
  | { status: 'idle' }
  | { status: 'unsupported' }
  | { status: 'disabled' }
  | { status: 'waiting' }
  | { status: 'writing' }
  | { status: 'verifying' }
  | { status: 'success'; uid: string }
  | { status: 'error'; code: NfcErrorCode; message: string };

interface NfcService {
  isSupported(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  writeProfileUrl(url: string, opts?: { timeoutMs?: number }): Promise<{ uid: string }>;
  cancel(): Promise<void>;
}
```

## Verification

The Expo configuration has been validated using `expo config --type public`:

✅ iOS entitlements correctly configured
✅ Android permissions correctly configured  
✅ Config plugin properly registered
✅ All settings match design specifications

## Testing NFC Configuration

### iOS
1. Build the development client with EAS: `eas build --profile development --platform ios`
2. Install on a physical iPhone 7 or newer (NFC is not available in simulator)
3. Verify NFC capability is detected: `NfcManager.isSupported()` should return `true`
4. Check NFC is enabled in Settings > General > NFC

### Android
1. Build the development client: `eas build --profile development --platform android`
2. Install on a physical Android device with NFC
3. Verify NFC capability: `NfcManager.isSupported()` should return `true`
4. Verify NFC is enabled: `NfcManager.isEnabled()` should return `true` when NFC is turned on in device settings

## Next Steps

Task 20.1 will implement the `NfcService` using `react-native-nfc-manager`:
- Support/enabled detection
- `writeProfileUrl` with timeout
- Read-back verification
- Cancel operation

Task 20.2 will implement the `useNfcWriter` hook with state machine
Task 20.3 will create the Program Card screen UI

## References

- [react-native-nfc-manager Documentation](https://github.com/revtel/react-native-nfc-manager)
- [react-native-nfc-manager Expo Plugin](https://github.com/revtel/react-native-nfc-manager/blob/master/app.plugin.js)
- [iOS CoreNFC Guide](https://developer.apple.com/documentation/corenfc)
- [Android NFC Guide](https://developer.android.com/guide/topics/connectivity/nfc)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
