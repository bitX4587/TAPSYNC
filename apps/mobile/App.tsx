import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

export default function App() {
  // @ts-ignore - require.context is provided by Metro bundler
  const ctx = require.context('./src/app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);