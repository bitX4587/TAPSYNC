const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Monorepo support: include the root so Metro can find packages/shared
const monorepoRoot = path.resolve(__dirname, '../..');
config.watchFolders = [monorepoRoot];

// Resolve node_modules from both the app and monorepo root.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

const mobileModules = path.resolve(__dirname, 'node_modules');

// The pnpm virtual store has react@18.3.1 (mobile) and react@19.3.1 (web).
// apps/mobile/node_modules/react is a junction to the virtual store copy,
// and node_modules/react at root is a real directory (also 18.3.1, leftover
// from a previous hoisted install). Metro sees these as two DIFFERENT paths
// and loads both, creating two React instances → "Objects are not valid as
// a React child".
//
// Fix: pin EVERY react import to the virtual store's real directory path
// (node_modules/.pnpm/react@18.3.1/node_modules/react) so Metro loads only
// one copy. Using the virtual store path directly avoids junction issues.
const reactPath = path.resolve(
  monorepoRoot,
  'node_modules/.pnpm/react@18.3.1/node_modules/react'
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force ALL react imports to a single physical copy
  if (moduleName === 'react') {
    return {
      filePath: path.resolve(reactPath, 'index.js'),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'react/jsx-runtime') {
    return {
      filePath: path.resolve(reactPath, 'jsx-runtime.js'),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'react/jsx-dev-runtime') {
    return {
      filePath: path.resolve(reactPath, 'jsx-dev-runtime.js'),
      type: 'sourceFile',
    };
  }

  // query-string v9 is pure ESM — use our CJS shim.
  if (moduleName === 'query-string') {
    return {
      filePath: path.resolve(__dirname, 'query-string-shim.js'),
      type: 'sourceFile',
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
