// Entry screen – redirects immediately to the dashboard or first-run flow.
// Full implementation in Task 17.
import { Redirect } from 'expo-router';

export default function Index() {
  // TODO (Task 17): check auth state and redirect accordingly
  return <Redirect href="/(tabs)/home" />;
}
