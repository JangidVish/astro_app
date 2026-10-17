import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { isValidTimezone, placeSchema, type Place } from '@astro/shared';
import { AppError } from '../../common/errors.js';
import { sha256Hex } from '../../common/hashing.js';
import { ProviderError, providerErrorToAppError } from '../astrology-provider/errors.js';
import type { AstrologyProvider, ProviderPlace } from '../astrology-provider/provider.js';
import type { QuotaService } from '../quota/service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Place search results are stable; cache them for 30 days (data-model 2.6). */
const RESULTS_TTL_MS = 30 * DAY_MS;
/** "No results" is cached briefly so a typo is not remembered for a month. */
const EMPTY_TTL_MS = DAY_MS;
const MAX_ROWS = 10;

const cachedSearchSchema = z.object({
  query: z.string(),
  places: z.array(placeSchema),
  expireAt: z.instanceof(Timestamp),
});

export interface PlacesDeps {
  db: Firestore;
  provider: AstrologyProvider;
  quota: QuotaService;
  now?: () => Date;
}

/** Cache key for a normalized query: case-insensitive. */
function queryKey(normalizedQuery: string): string {
  return sha256Hex(normalizedQuery.toLowerCase());
}

/** Stable id for a place: the same place from any search gets the same id. */
function placeIdOf(p: ProviderPlace): string {
  const identity = [p.name, p.countryCode, p.lat.toFixed(4), p.lon.toFixed(4), p.timezoneId].join(
    '|',
  );
  return `pl_${sha256Hex(identity).slice(0, 24)}`;
}

/** Keeps only places we can use for birth charts; the provider occasionally returns junk. */
function toPlace(p: ProviderPlace): Place | null {
  const candidate = {
    placeId: placeIdOf(p),
    name: p.name,
    countryCode: p.countryCode,
    lat: Math.round(p.lat * 10_000) / 10_000, // ~11 m precision (data-model 2.2)
    lon: Math.round(p.lon * 10_000) / 10_000,
    timezoneId: p.timezoneId,
  };
  if (!isValidTimezone(candidate.timezoneId)) return null;
  const parsed = placeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export class PlacesService {
  private readonly now: () => Date;

  constructor(private readonly deps: PlacesDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Searches places by name. Cached results cost nothing; a miss uses one metered provider call.
   * `query` must already be normalized by the shared placeSearchQuerySchema.
   */
  async search(uid: string, query: string): Promise<Place[]> {
    const now = this.now();
    const searchRef = this.deps.db.collection('places').doc(queryKey(query));

    const cached = cachedSearchSchema.safeParse((await searchRef.get()).data());
    // TTL deletion can lag by a day, so expiry is enforced on read as well.
    if (cached.success && cached.data.expireAt.toMillis() > now.getTime()) {
      return cached.data.places;
    }

    let results: ProviderPlace[];
    try {
      results = (
        await this.deps.quota.runMetered(uid, () =>
          this.deps.provider.searchPlaces(query, MAX_ROWS),
        )
      ).data;
    } catch (error) {
      if (error instanceof ProviderError) throw providerErrorToAppError(error);
      throw error;
    }

    const places = results.map(toPlace).filter((p): p is Place => p !== null);
    const expireAt = Timestamp.fromMillis(
      now.getTime() + (places.length > 0 ? RESULTS_TTL_MS : EMPTY_TTL_MS),
    );

    const batch = this.deps.db.batch();
    batch.set(searchRef, { query, places, expireAt });
    for (const place of places) {
      batch.set(this.deps.db.collection('placeIds').doc(place.placeId), {
        ...place,
        expireAt: Timestamp.fromMillis(now.getTime() + RESULTS_TTL_MS),
      });
    }
    await batch.commit();
    return places;
  }

  /**
   * Looks up a place returned by a recent search. Profiles may only use places obtained this way,
   * never client-supplied coordinates (data-model 4.2).
   */
  async resolvePlace(placeId: string): Promise<Place> {
    const notResolved = () =>
      new AppError('PLACE_NOT_RESOLVED', 400, 'Please choose the place from the search results', {
        details: [{ path: 'placeId', code: 'PLACE_NOT_RESOLVED' }],
      });
    if (!/^pl_[0-9a-f]{24}$/.test(placeId)) throw notResolved();

    const data = (await this.deps.db.collection('placeIds').doc(placeId).get()).data();
    const stored = placeSchema.extend({ expireAt: z.instanceof(Timestamp) }).safeParse(data);
    if (!stored.success || stored.data.expireAt.toMillis() <= this.now().getTime()) {
      throw notResolved();
    }
    const { expireAt: _expireAt, ...place } = stored.data;
    return place;
  }
}
