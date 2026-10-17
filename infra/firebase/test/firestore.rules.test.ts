import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-astro-app';
const OWNER = 'user-alice';
const OTHER = 'user-bob';

// Every path in data-model.md section 2. Clients must be denied on all of them,
// including their own user document.
const PATHS = [
  `users/${OWNER}`,
  `users/${OWNER}/profiles/p1`,
  `users/${OWNER}/profiles/p1/results/chart_D1`,
  `users/${OWNER}/profiles/p1/predictions/2026-10-17`,
  `users/${OWNER}/usage/2026-10-17`,
  'places/abc123',
  'providerCalls/call1',
  'auditEvents/evt1',
  '_migrations/0001_init',
];

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed data the way the API would: with rules disabled (equivalent to the Admin SDK).
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const path of PATHS) {
      await setDoc(doc(ctx.firestore(), path), { seeded: true });
    }
  });
});

const clients = {
  unauthenticated: () => env.unauthenticatedContext().firestore(),
  'authenticated owner': () => env.authenticatedContext(OWNER).firestore(),
  'authenticated other user': () => env.authenticatedContext(OTHER).firestore(),
};

describe('firestore.rules: clients have no direct access', () => {
  for (const [label, getDb] of Object.entries(clients)) {
    describe(label, () => {
      for (const path of PATHS) {
        it(`cannot read ${path}`, async () => {
          await assertFails(getDoc(doc(getDb(), path)));
        });
        it(`cannot write ${path}`, async () => {
          await assertFails(setDoc(doc(getDb(), path), { hacked: true }));
        });
        it(`cannot delete ${path}`, async () => {
          await assertFails(deleteDoc(doc(getDb(), path)));
        });
      }
      it('cannot list the users collection', async () => {
        await assertFails(getDocs(collection(getDb(), 'users')));
      });
    });
  }
});

describe('firestore.rules: server (rules bypassed) still works', () => {
  it('can read seeded data with rules disabled, proving denials above are rule-driven', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(getDoc(doc(ctx.firestore(), `users/${OWNER}`)));
    });
  });
});
