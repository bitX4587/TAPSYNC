/**
 * Jest configuration for the TapSync mobile app.
 *
 * pnpm monorepo note: packages live at <root>/node_modules/.pnpm/<pkg@ver>/node_modules/<pkg>
 * The standard jest-expo transformIgnorePatterns only handles flat node_modules layouts.
 * We override with an empty array so Babel transforms everything — this is safe because
 * Jest only transforms files actually required during tests (it's not a full bundle step).
 */
module.exports = {
  preset: 'jest-expo',
  // Transform everything — required for pnpm's virtual store layout where packages
  // like expo-modules-core live two node_modules levels deep.
  transformIgnorePatterns: [],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^@react-native/js-polyfills/error-guard$': '<rootDir>/jest.setup.js',
    // expo-sqlite is a native module that cannot run under Node. Route it to the
    // in-memory implementation in src/__mocks__/expo-sqlite.ts for all tests.
    // TypeScript still resolves the real package's types (see tsconfig.json).
    '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
  },
};
