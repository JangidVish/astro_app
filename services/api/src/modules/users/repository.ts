import { Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { auditInTransaction } from '../../common/audit.js';

const USER_SCHEMA_VERSION = 1;

const timestamp = z.instanceof(Timestamp);

/** `users/{uid}` as stored (data-model 2.1). Validated on every read. */
const userDocSchema = z.object({
  displayName: z.string().nullable(),
  primaryProfileId: z.string().nullable(),
  profileCount: z.number().int().min(0),
  consent: z
    .object({ privacyVersion: z.string(), termsVersion: z.string(), acceptedAt: timestamp })
    .nullable(),
  status: z.enum(['active', 'deleting']),
  createdAt: timestamp,
  updatedAt: timestamp,
  schemaVersion: z.literal(USER_SCHEMA_VERSION),
});
export type UserDoc = z.infer<typeof userDocSchema>;

/** A stored document that fails validation. Surfaces as a 500 and is logged; never "fixed" silently. */
export class CorruptUserDocError extends Error {
  constructor(cause: unknown) {
    super('stored user document is invalid', { cause });
    this.name = 'CorruptUserDocError';
  }
}

function parseUser(data: unknown): UserDoc {
  const parsed = userDocSchema.safeParse(data);
  if (!parsed.success) throw new CorruptUserDocError(parsed.error);
  return parsed.data;
}

export class UsersRepository {
  constructor(private readonly db: Firestore) {}

  private ref(uid: string): DocumentReference {
    return this.db.collection('users').doc(uid);
  }

  /**
   * Returns the user, creating it on first use. The transaction makes concurrent first requests
   * create exactly one document and one `account_created` audit event.
   */
  async getOrCreate(uid: string, uidHash: string, now: Date): Promise<UserDoc> {
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(this.ref(uid));
      if (snapshot.exists) return parseUser(snapshot.data());

      const at = Timestamp.fromDate(now);
      const user: UserDoc = {
        displayName: null,
        primaryProfileId: null,
        profileCount: 0,
        consent: null,
        status: 'active',
        createdAt: at,
        updatedAt: at,
        schemaVersion: USER_SCHEMA_VERSION,
      };
      tx.create(this.ref(uid), user);
      auditInTransaction(this.db, tx, { type: 'account_created', uidHash, at: now });
      return user;
    });
  }

  /** Applies a partial update to an existing user and returns the result. */
  async update(
    uid: string,
    changes: {
      displayName?: string | null;
      consent?: { privacyVersion: string; termsVersion: string };
    },
    now: Date,
  ): Promise<UserDoc> {
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(this.ref(uid));
      const current = parseUser(snapshot.data());
      const at = Timestamp.fromDate(now);
      const next: UserDoc = {
        ...current,
        ...(changes.displayName !== undefined ? { displayName: changes.displayName } : {}),
        ...(changes.consent ? { consent: { ...changes.consent, acceptedAt: at } } : {}),
        updatedAt: at,
      };
      tx.set(this.ref(uid), next);
      return next;
    });
  }
}
