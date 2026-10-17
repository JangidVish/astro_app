import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { AppError } from '../../common/errors.js';
import { ProviderError, providerErrorToAppError } from '../astrology-provider/errors.js';
import type { ProviderResult, ProviderSource } from '../astrology-provider/provider.js';
import type { ProfileForReadings } from '../birth-profiles/service.js';
import type { QuotaService } from '../quota/service.js';

/**
 * Bump when the internal shape of a cached result changes: old documents are then refetched
 * (or re-mapped from `raw` by a migration) instead of being served in the wrong shape.
 */
export const RESULT_VERSION = 1;

const storedResultSchema = z.object({
  inputHash: z.string(),
  source: z.enum(['astrologyapi', 'mock']),
  resultVersion: z.number(),
  data: z.unknown(),
  fetchedAt: z.instanceof(Timestamp),
});

export interface CachedReading<T> {
  readonly data: T;
  readonly fetchedAt: Date;
}

export interface ReadingsCacheDeps {
  db: Firestore;
  quota: QuotaService;
  /** Source of the configured provider; cached results from another source are never served. */
  source: ProviderSource;
  now?: () => Date;
}

/**
 * Provider results per profile, cached in users/{uid}/profiles/{id}/{collection}/{key}.
 * Chart and dasha data never change for fixed birth inputs (provider guidance), so they are kept
 * until the profile changes; predictions use their own collection and TTL.
 */
export class ReadingsCache {
  private readonly now: () => Date;
  private readonly inFlight = new Map<string, Promise<CachedReading<unknown>>>();

  constructor(private readonly deps: ReadingsCacheDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Returns the cached reading if it is valid for the profile's current birth inputs; otherwise
   * makes one metered provider call. Concurrent identical requests share that call.
   */
  get<T>(
    uid: string,
    profile: ProfileForReadings,
    location: { collection: 'results' | 'predictions'; key: string; expireAt?: Date },
    schema: z.ZodType<T>,
    fetch: () => Promise<ProviderResult<T>>,
  ): Promise<CachedReading<T>> {
    const flightKey = [
      uid,
      profile.profileId,
      location.collection,
      location.key,
      profile.inputHash,
    ].join('/');
    const existing = this.inFlight.get(flightKey);
    if (existing) return existing as Promise<CachedReading<T>>;

    const promise = this.load(uid, profile, location, schema, fetch).finally(() => {
      this.inFlight.delete(flightKey);
    });
    this.inFlight.set(flightKey, promise);
    return promise;
  }

  private async load<T>(
    uid: string,
    profile: ProfileForReadings,
    location: { collection: 'results' | 'predictions'; key: string; expireAt?: Date },
    schema: z.ZodType<T>,
    fetch: () => Promise<ProviderResult<T>>,
  ): Promise<CachedReading<T>> {
    const profileRef = this.deps.db
      .collection('users')
      .doc(uid)
      .collection('profiles')
      .doc(profile.profileId);
    const ref = profileRef.collection(location.collection).doc(location.key);

    const cached = this.validCached(await ref.get(), profile.inputHash, schema);
    if (cached) return cached;

    let result: ProviderResult<T>;
    try {
      result = await this.deps.quota.runMetered(uid, fetch);
    } catch (error) {
      if (error instanceof ProviderError) throw providerErrorToAppError(error);
      throw error;
    }

    const fetchedAt = this.now();
    // Write only if the profile's birth inputs did not change while we were fetching; otherwise
    // the result belongs to old data and must not be stored (it is still returned to this caller,
    // who asked before the edit).
    await this.deps.db.runTransaction(async (tx) => {
      const current = await tx.get(profileRef);
      if (current.get('inputHash') !== profile.inputHash) return;
      tx.set(ref, {
        inputHash: profile.inputHash,
        source: result.source,
        resultVersion: RESULT_VERSION,
        endpoint: result.endpoint,
        data: result.data,
        raw: result.raw,
        fetchedAt: Timestamp.fromDate(fetchedAt),
        ...(location.expireAt ? { expireAt: Timestamp.fromDate(location.expireAt) } : {}),
        schemaVersion: 1,
      });
    });
    return { data: result.data, fetchedAt };
  }

  private validCached<T>(
    snapshot: FirebaseFirestore.DocumentSnapshot,
    inputHash: string,
    schema: z.ZodType<T>,
  ): CachedReading<T> | null {
    if (!snapshot.exists) return null;
    const stored = storedResultSchema.safeParse(snapshot.data());
    if (!stored.success) return null; // corrupt: refetch rather than serve
    const s = stored.data;
    if (
      s.inputHash !== inputHash ||
      s.source !== this.deps.source ||
      s.resultVersion !== RESULT_VERSION
    ) {
      return null;
    }
    const expireAt: unknown = snapshot.get('expireAt');
    if (expireAt instanceof Timestamp && expireAt.toMillis() <= this.now().getTime()) return null;
    const data = schema.safeParse(s.data);
    return data.success ? { data: data.data, fetchedAt: s.fetchedAt.toDate() } : null;
  }
}

/** Charts, dasha and houses need the exact birth time (FR-8). */
export function requireBirthTime(profile: ProfileForReadings): void {
  if (!profile.timeKnown) {
    throw new AppError(
      'BIRTH_TIME_REQUIRED',
      409,
      'This needs the exact birth time. Add it to the profile to see it.',
    );
  }
}
