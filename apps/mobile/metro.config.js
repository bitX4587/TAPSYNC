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

// Fix: expo/AppEntry.js imports '../../App' which resolves to the wrong
// path in pnpm's node_modules structure. Our app uses expo-router, so
// redirect the import to the expo-router entry point.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '../../App') {
    return {
      filePath: require.resolve('expo-router/entry', { paths: [__dirname] }),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;