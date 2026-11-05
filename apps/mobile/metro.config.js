const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Monorepo support: include the root so Metro can find packages/shared
const monorepoRoot = path.resolve(__dirname, '../..');
config.watchFolders = [monorepoRoot];

// Resolve node_modules from both the app and monorepo root.
// The mobile app's node_modules must come FIRST so React 18 wins over
// any React 19 that the web app hoisted to the root.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Pin react and react-native to the mobile app's own copies.
const mobileModules = path.resolve(__dirname, 'node_modules');
config.resolver.extraNodeModules = {
  'react': path.resolve(mobileModules, 'react'),
  'react-dom': path.resolve(mobileModules, 'react-dom'),
  'react-native': path.resolve(mobileModules, 'react-native'),
};

// query-string v9 is pure ESM. expo-router calls require('query-string')
// and accesses .stringify/.parse directly. This shim provides a CJS-
// compatible wrapper so those calls work at runtime.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '../../App') {
    return {
      filePath: require.resolve('expo-router/entry', { paths: [__dirname] }),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'query-string') {
    return {
      filePath: path.resolve(__dirname, 'query-string-shim.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
