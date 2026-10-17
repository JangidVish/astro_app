import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  OAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { toAuthError, type AuthService, type AuthUser } from './auth-service';

/** Firebase web config. These values identify the project; they are not secrets. */
export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  /** Local development only, e.g. "http://127.0.0.1:9099". */
  authEmulatorUrl?: string;
}

export function firebaseConfigFromEnv(
  env: Record<string, string | undefined>,
): FirebasePublicConfig | null {
  const apiKey = env['EXPO_PUBLIC_FIREBASE_API_KEY'];
  const authDomain = env['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'];
  const projectId = env['EXPO_PUBLIC_FIREBASE_PROJECT_ID'];
  const appId = env['EXPO_PUBLIC_FIREBASE_APP_ID'];
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  const authEmulatorUrl = env['EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL'];
  return { apiKey, authDomain, projectId, appId, ...(authEmulatorUrl ? { authEmulatorUrl } : {}) };
}

function toUser(
  user: { uid: string; email: string | null; providerData: { providerId: string }[] } | null,
): AuthUser | null {
  return user
    ? { uid: user.uid, email: user.email, providers: user.providerData.map((p) => p.providerId) }
    : null;
}

/** Wraps an auth call so every failure surfaces as an AuthError with a stable reason. */
async function guard(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    throw toAuthError(error);
  }
}

/**
 * Sign in with Apple: a random nonce is hashed for Apple and the raw value given to Firebase, so a
 * stolen Apple token cannot be replayed (Firebase's documented flow).
 */
async function appleCredential() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const result = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashedNonce,
  });
  if (!result.identityToken) throw new Error('Apple returned no identity token');
  return new OAuthProvider('apple.com').credential({ idToken: result.identityToken, rawNonce });
}

async function appleSignIn(auth: Auth): Promise<void> {
  await signInWithCredential(auth, await appleCredential());
}

export function createFirebaseAuthService(config: FirebasePublicConfig): AuthService {
  const app =
    getApps().find((a) => a.name === '[DEFAULT]') ??
    initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
    });
  const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  if (config.authEmulatorUrl)
    connectAuthEmulator(auth, config.authEmulatorUrl, { disableWarnings: true });

  return {
    onAuthStateChanged: (listener) => onAuthStateChanged(auth, (user) => listener(toUser(user))),
    signInWithEmail: (email, password) =>
      guard(() => signInWithEmailAndPassword(auth, email.trim(), password)),
    signUpWithEmail: (email, password) =>
      guard(() => createUserWithEmailAndPassword(auth, email.trim(), password)),
    sendPasswordReset: (email) => guard(() => sendPasswordResetEmail(auth, email.trim())),
    // Sign in with Apple is offered on iOS (required there when Google sign-in is offered).
    apple: Platform.OS === 'ios' ? { signIn: () => guard(() => appleSignIn(auth)) } : null,
    // Google needs OAuth client ids from the real Firebase/Google Cloud project (backlog M0.2);
    // wired in T10 together with App Check and the native Firebase config files.
    google: null,
    signOut: () => guard(() => signOut(auth)),
    getIdToken: async (forceRefresh = false) =>
      auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null,
    reauthenticate: ({ password }) =>
      guard(async () => {
        const user = auth.currentUser;
        if (!user) throw new Error('not signed in');
        const providers = user.providerData.map((p) => p.providerId);
        if (providers.includes('password') && user.email && password) {
          await reauthenticateWithCredential(
            user,
            EmailAuthProvider.credential(user.email, password),
          );
        } else if (providers.includes('apple.com')) {
          await reauthenticateWithCredential(user, await appleCredential());
        } else {
          throw new Error('no supported re-authentication method');
        }
      }),
  };
}
