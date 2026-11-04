const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Monorepo support: include the root so Metro can find packages/shared
const monorepoRoot = path.resolve(__dirname, '../..');
config.watchFolders = [monorepoRoot];

// Resolve node_modules from both the app and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Map @tapsync/shared to its TypeScript source instead of dist
// Metro can bundle TypeScript directly, so no build step is needed
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@tapsync/shared': path.resolve(monorepoRoot, 'packages/shared/src/index.ts'),
};

module.exports = config;