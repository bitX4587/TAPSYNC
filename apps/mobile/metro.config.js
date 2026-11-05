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

// Force react, react-dom and react-native to always resolve from the
// mobile app's own node_modules, preventing React 19 (from the web app)
// from being picked up via root hoisting.
const mobileNodeModules = path.resolve(__dirname, 'node_modules');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '../../App') {
    return {
      filePath: require.resolve('expo-router/entry', { paths: [__dirname] }),
      type: 'sourceFile',
    };
  }

  if (
    moduleName === 'react' ||
    moduleName === 'react-dom' ||
    moduleName === 'react-native' ||
    moduleName.startsWith('react/') ||
    moduleName.startsWith('react-dom/') ||
    moduleName.startsWith('react-native/')
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(mobileNodeModules, 'expo', 'package.json') },
      moduleName,
      platform,
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;