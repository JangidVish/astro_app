import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { auditInTransaction } from '../../common/audit.js';
import { AppError } from '../../common/errors.js';
import { uidHash } from '../../common/hashing.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Usage counters are only needed for the current day; TTL removes them after a week. */
const USAGE_RETENTION_MS = 7 * DAY_MS;

export interface QuotaDeps {
  db: Firestore;
  pepper: Buffer;
  /** Provider calls allowed per user per UTC day (config QUOTA_PROVIDER_CALLS_PER_DAY). */
  limitPerDay: number;
  now?: () => Date;
}

/** `yyyy-mm-dd` of the UTC day containing `at`. */
function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Whole seconds until the next UTC midnight (at least 1). */
export function secondsUntilUtcMidnight(at: Date): number {
  const next = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - at.getTime()) / 1000));
}

/**
 * Per-user daily budget for astrology provider calls (NFR-5). Only real provider calls are
 * metered; callers serve cache hits without touching the quota.
 */
export class QuotaService {
  private readonly now: () => Date;

  constructor(private readonly deps: QuotaDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private usageRef(uid: string, day: string) {
    return this.deps.db.collection('users').doc(uid).collection('usage').doc(day);
  }

  /**
   * Reserves one provider call for today, or throws 429 QUOTA_EXCEEDED with Retry-After.
   * The transaction keeps the counter exact under concurrent requests.
   */
  async reserve(uid: string): Promise<{ day: string }> {
    const at = this.now();
    const day = utcDay(at);
    const ref = this.usageRef(uid, day);

    const allowed = await this.deps.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const used = snapshot.exists ? Number(snapshot.get('providerCalls') ?? 0) : 0;

      if (used + 1 > this.deps.limitPerDay) {
        // Audit the first breach of the day only, so a retry loop cannot flood the audit log.
        if (snapshot.get('exceededAt') === undefined) {
          tx.set(ref, { exceededAt: Timestamp.fromDate(at) }, { merge: true });
          auditInTransaction(this.deps.db, tx, {
            type: 'quota_exceeded',
            uidHash: uidHash(uid, this.deps.pepper),
            at,
          });
        }
        return false;
      }

      tx.set(
        ref,
        {
          providerCalls: used + 1,
          expireAt: Timestamp.fromMillis(Date.parse(`${day}T00:00:00Z`) + USAGE_RETENTION_MS),
        },
        { merge: true },
      );
      return true;
    });

    if (!allowed) {
      throw new AppError('QUOTA_EXCEEDED', 429, 'Daily limit reached, try again tomorrow', {
        retryable: true,
        headers: { 'retry-after': String(secondsUntilUtcMidnight(at)) },
      });
    }
    return { day };
  }

  /** Gives back a reserved call (the provider call failed, so it should not count). */
  async refund(uid: string, day: string): Promise<void> {
    await this.usageRef(uid, day).set({ providerCalls: FieldValue.increment(-1) }, { merge: true });
  }

  /**
   * Runs `call` under the quota: reserve first, refund if the call throws. A failed refund is
   * swallowed (logged by the caller's error path) so it never masks the original error.
   */
  async runMetered<T>(uid: string, call: () => Promise<T>): Promise<T> {
    const { day } = await this.reserve(uid);
    try {
      return await call();
    } catch (error) {
      await this.refund(uid, day).catch(() => undefined);
      throw error;
    }
  }

  /** Calls used today (for diagnostics and tests). */
  async usedToday(uid: string): Promise<number> {
    const snapshot = await this.usageRef(uid, utcDay(this.now())).get();
    return snapshot.exists ? Number(snapshot.get('providerCalls') ?? 0) : 0;
  }
}
