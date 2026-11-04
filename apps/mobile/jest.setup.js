// Jest setup file for TapSync mobile app

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock React Native error guard to avoid Flow syntax issues
jest.mock('@react-native/js-polyfills/error-guard', () => ({}));

