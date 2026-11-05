// Workaround for expo/AppEntry.js in pnpm monorepo with hoisted node_modules.
// expo/AppEntry.js imports "../../App" which resolves to the monorepo root
// instead of the app directory. This file bootstraps expo-router.
// See: https://github.com/expo/expo/issues/49659
import { ExpoRoot } from 'expo-router';

export default function App() {
  // @ts-ignore � require.context is provided by Metro bundler
  const ctx = require.context('./apps/mobile/src/app');
  return <ExpoRoot context={ctx} />;
}
