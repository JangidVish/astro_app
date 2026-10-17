import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { currentContext } from '../../common/request-context.js';
import type { ProviderCallRecord } from './astrologyapi/client.js';

/** Provider call metadata is kept 30 days (data-model 2.6), removed by a TTL policy on expireAt. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Writes one `providerCalls` document per HTTP attempt: endpoint, status, latency, error kind and
 * the pseudonymous uidHash of the user it was for. Never request bodies, responses or credentials.
 * Writes are fire-and-forget: bookkeeping must not slow down or fail a user request.
 */
export class ProviderCallLog {
  constructor(
    private readonly db: Firestore,
    private readonly onWriteError: (error: unknown) => void = () => undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  readonly record = (call: ProviderCallRecord): void => {
    const at = this.now();
    this.db
      .collection('providerCalls')
      .add({
        endpoint: call.endpoint,
        attempt: call.attempt,
        status: call.status,
        errorKind: call.errorKind,
        latencyMs: call.latencyMs,
        uidHash: currentContext()?.uidHash ?? null,
        at: Timestamp.fromDate(at),
        expireAt: Timestamp.fromMillis(at.getTime() + RETENTION_MS),
      })
      .catch(this.onWriteError);
  };
}
