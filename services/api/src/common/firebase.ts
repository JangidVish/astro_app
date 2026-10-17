import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const APP_NAME = 'astro-api';

/**
 * The single firebase-admin app for this process. On Cloud Run it authenticates as the service
 * account (Application Default Credentials); locally the *_EMULATOR_HOST variables route it to
 * the emulators (refused in staging/prod by loadConfig).
 */
export function firebaseApp(projectId: string): App {
  return getApps().find((a) => a.name === APP_NAME) ?? initializeApp({ projectId }, APP_NAME);
}

let configured: Firestore | undefined;

export function firestore(projectId: string): Firestore {
  if (!configured) {
    configured = getFirestore(firebaseApp(projectId));
    // Optional fields are omitted rather than stored as undefined (which Firestore rejects).
    configured.settings({ ignoreUndefinedProperties: true });
  }
  return configured;
}
