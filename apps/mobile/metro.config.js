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

// Force react, react-dom and react-native to always resolve from the
// mobile app's own node_modules, regardless of what is hoisted at the
// monorepo root (where React 19 from the web app may live).
const mobileNodeModules = path.resolve(__dirname, 'node_modules');
const reactPath = path.resolve(mobileNodeModules, 'react');
const reactNativePath = path.resolve(mobileNodeModules, 'react-native');
const reactDomPath = path.resolve(mobileNodeModules, 'react-dom');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '../../App') {
    return {
      filePath: require.resolve('expo-router/entry', { paths: [__dirname] }),
      type: 'sourceFile',
    };
  }

  // Pin react/react-native/react-dom to mobile's own copies
  if (moduleName === 'react') {
    return { filePath: path.join(reactPath, 'index.js'), type: 'sourceFile' };
  }
  if (moduleName === 'react-native') {
    return { filePath: path.join(reactNativePath, 'index.js'), type: 'sourceFile' };
  }
  if (moduleName === 'react-dom') {
    return { filePath: path.join(reactDomPath, 'index.js'), type: 'sourceFile' };
  }
  if (moduleName.startsWith('react/')) {
    const subpath = moduleName.slice('react/'.length);
    return { filePath: path.join(reactPath, subpath), type: 'sourceFile' };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;