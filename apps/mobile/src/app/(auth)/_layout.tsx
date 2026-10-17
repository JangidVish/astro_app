import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/auth/auth-context';

/** Sign-in, sign-up and reset. A signed-in user is sent into the app. */
export default function AuthLayout() {
  const { state } = useAuth();
  if (state.status === 'signedIn') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: true }} />;
}
