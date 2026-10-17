import type { App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { auditInTransaction } from '../../common/audit.js';
import { AppError } from '../../common/errors.js';
import { uidHash } from '../../common/hashing.js';

/** Sensitive operations need a sign-in this recent (Apple guideline 5.1.1(v); data-model 3). */
export const REAUTH_WINDOW_SECONDS = 5 * 60;

/** Deletes Firebase Auth accounts. Interface so tests can verify calls without real accounts. */
export interface AuthAdmin {
  /** Deletes the account; resolves even if it no longer exists. */
  deleteUser(uid: string): Promise<void>;
  /** Whether the auth account still exists. */
  exists(uid: string): Promise<boolean>;
}

export class FirebaseAuthAdmin implements AuthAdmin {
  constructor(private readonly app: App) {}

  async deleteUser(uid: string): Promise<void> {
    try {
      await getAuth(this.app).deleteUser(uid);
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code !== 'auth/user-not-found') throw error;
    }
  }

  async exists(uid: string): Promise<boolean> {
    try {
      await getAuth(this.app).getUser(uid);
      return true;
    } catch (error) {
      if ((error as { code?: unknown }).code === 'auth/user-not-found') return false;
      throw error;
    }
  }
}

export interface AccountDeletionDeps {
  db: Firestore;
  authAdmin: AuthAdmin;
  pepper: Buffer;
  now?: () => Date;
}

/**
 * Deletes a user's account and all their personal data (FR-2, NFR-9).
 *
 * Every step is idempotent so an interrupted deletion can be finished by resumePendingDeletions():
 *  1. mark users/{uid} as "deleting" and write the audit event (once, in one transaction);
 *  2. recursively delete users/{uid} (profiles, readings, usage);
 *  3. delete the Firebase Auth account.
 * Shared caches (places) hold no personal data; audit/provider logs hold only uidHash.
 */
export class AccountDeletionService {
  private readonly now: () => Date;

  constructor(private readonly deps: AccountDeletionDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** DELETE /v1/me: checks the sign-in is recent, then deletes everything. */
  async deleteAccount(uid: string, authTimeSeconds: number): Promise<void> {
    const ageSeconds = this.now().getTime() / 1000 - authTimeSeconds;
    if (ageSeconds > REAUTH_WINDOW_SECONDS) {
      throw new AppError('REAUTH_REQUIRED', 401, 'Please sign in again to delete your account');
    }
    const userDoc = await this.deps.db.collection('users').doc(uid).get();
    if (!userDoc.exists && !(await this.deps.authAdmin.exists(uid))) {
      return; // already fully deleted: repeating is a no-op (and must not audit again)
    }
    await this.markDeleting(uid);
    await this.finish(uid);
  }

  /** Step 1: status -> deleting, audited exactly once (only on the transition). */
  private async markDeleting(uid: string): Promise<void> {
    const ref = this.deps.db.collection('users').doc(uid);
    const at = this.now();
    await this.deps.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.get('status') === 'deleting') return;
      tx.set(ref, { status: 'deleting', updatedAt: Timestamp.fromDate(at) }, { merge: true });
      auditInTransaction(this.deps.db, tx, {
        type: 'account_deleted',
        uidHash: uidHash(uid, this.deps.pepper),
        at,
      });
    });
  }

  /** Steps 2 and 3. Safe to repeat. */
  private async finish(uid: string): Promise<void> {
    // Delete the auth account first: once it is gone no new data can be written for this uid,
    // and if Firestore cleanup is interrupted, the "deleting" marker lets the resume job finish it.
    await this.deps.authAdmin.deleteUser(uid);
    await this.deps.db.recursiveDelete(this.deps.db.collection('users').doc(uid));
  }

  /** Finishes deletions interrupted part-way (run on a schedule; T10). Returns how many. */
  async resumePendingDeletions(): Promise<number> {
    const pending = await this.deps.db.collection('users').where('status', '==', 'deleting').get();
    for (const doc of pending.docs) await this.finish(doc.id);
    return pending.size;
  }
}
