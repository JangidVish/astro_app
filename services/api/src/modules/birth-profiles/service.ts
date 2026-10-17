import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  MAX_PROFILES_PER_USER,
  placeSchema,
  resolveBirthTime,
  type BirthDate,
  type BirthTime,
  type OffsetChoice,
  type Place,
  type Profile,
  type ProfileCreateInput,
  type ProfileUpdateInput,
} from '@astro/shared';
import { auditInTransaction } from '../../common/audit.js';
import { AppError } from '../../common/errors.js';
import { sha256Hex, uidHash } from '../../common/hashing.js';
import type { BirthInput } from '../astrology-provider/provider.js';
import type { PlacesService } from '../places/service.js';
import type { UsersService } from '../users/service.js';

const PROFILE_SCHEMA_VERSION = 1;
/** Firestore auto-ids: 20 alphanumerics. Anything else could address a different document path. */
const PROFILE_ID = /^[A-Za-z0-9]{20}$/;

const timestamp = z.instanceof(Timestamp);

/** `users/{uid}/profiles/{profileId}` as stored (data-model 2.2). Validated on every read. */
const storedProfileSchema = z.object({
  name: z.string(),
  relation: z.enum(['self', 'partner', 'family', 'friend', 'other']),
  birthDate: z.object({ year: z.number(), month: z.number(), day: z.number() }),
  timeKnown: z.boolean(),
  birthTime: z.object({ hour: z.number(), minute: z.number() }).nullable(),
  place: placeSchema,
  utcOffsetMinutes: z.number().int(),
  offsetChoice: z.enum(['earlier', 'later']).nullable(),
  timeAssumedNoon: z.boolean(),
  instantUtc: z.string(),
  inputHash: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
});
type StoredProfile = z.infer<typeof storedProfileSchema>;

/** What the chart, dasha and prediction modules need from a profile. */
export interface ProfileForReadings {
  readonly profileId: string;
  readonly inputHash: string;
  readonly timeKnown: boolean;
  readonly timeAssumedNoon: boolean;
  readonly birth: BirthInput;
}

export interface ProfilesDeps {
  db: Firestore;
  users: UsersService;
  places: PlacesService;
  pepper: Buffer;
  now?: () => Date;
}

interface BirthFields {
  birthDate: BirthDate;
  timeKnown: boolean;
  birthTime: BirthTime | null;
  place: Place;
  offsetChoice: OffsetChoice | null;
}

const toIso = (t: Timestamp) => t.toDate().toISOString().replace('.000Z', 'Z');

/** Canonical hash of everything that determines provider results (data-model 2.2). */
export function birthInputHash(fields: {
  birthDate: BirthDate;
  birthTime: BirthTime | null;
  place: Place;
  utcOffsetMinutes: number;
}): string {
  const { hour, minute } = fields.birthTime ?? { hour: 12, minute: 0 };
  return sha256Hex(
    JSON.stringify({
      date: [fields.birthDate.year, fields.birthDate.month, fields.birthDate.day],
      time: [hour, minute],
      lat: fields.place.lat,
      lon: fields.place.lon,
      utcOffsetMinutes: fields.utcOffsetMinutes,
      ayanamsa: 'lahiri',
      provider: 'astrologyapi-v1',
    }),
  );
}

export class ProfilesService {
  private readonly now: () => Date;

  constructor(private readonly deps: ProfilesDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private userRef(uid: string): DocumentReference {
    return this.deps.db.collection('users').doc(uid);
  }

  private profileRef(uid: string, profileId: string): DocumentReference {
    // Validate before building the path: "a/b" or ".." would address another document.
    if (!PROFILE_ID.test(profileId)) throw AppError.notFound();
    return this.userRef(uid).collection('profiles').doc(profileId);
  }

  /** Resolves place and time into the stored birth fields, or throws a field-level 400. */
  private resolveBirth(fields: BirthFields) {
    const resolution = resolveBirthTime(
      {
        date: fields.birthDate,
        time: fields.timeKnown ? fields.birthTime : null,
        timezoneId: fields.place.timezoneId,
        offsetChoice: fields.offsetChoice,
      },
      this.now(),
    );
    const invalid = (code: 'TIME_IN_DST_GAP' | 'TIME_AMBIGUOUS' | 'DATE_IN_FUTURE', path: string) =>
      new AppError('VALIDATION_FAILED', 400, 'Request validation failed', {
        details: [{ path, code }],
      });
    switch (resolution.status) {
      case 'gap':
        throw invalid('TIME_IN_DST_GAP', 'birthTime');
      case 'ambiguous':
        throw invalid('TIME_AMBIGUOUS', 'offsetChoice');
      case 'future':
        throw invalid('DATE_IN_FUTURE', 'birthDate');
      case 'invalid_zone':
        throw new AppError('PLACE_NOT_RESOLVED', 400, 'Please choose the place again', {
          details: [{ path: 'placeId', code: 'PLACE_NOT_RESOLVED' }],
        });
      case 'ok': {
        const utcOffsetMinutes = resolution.utcOffsetMinutes;
        return {
          birthDate: fields.birthDate,
          timeKnown: fields.timeKnown,
          birthTime: fields.timeKnown ? fields.birthTime : null,
          place: fields.place,
          utcOffsetMinutes,
          // A choice only means something for an ambiguous time; otherwise store none.
          offsetChoice: this.isAmbiguous(fields) ? fields.offsetChoice : null,
          timeAssumedNoon: resolution.timeAssumedNoon,
          instantUtc: resolution.instantUtc,
          inputHash: birthInputHash({ ...fields, utcOffsetMinutes }),
        };
      }
    }
  }

  private isAmbiguous(fields: BirthFields): boolean {
    return (
      resolveBirthTime(
        {
          date: fields.birthDate,
          time: fields.timeKnown ? fields.birthTime : null,
          timezoneId: fields.place.timezoneId,
          offsetChoice: null,
        },
        this.now(),
      ).status === 'ambiguous'
    );
  }

  private toProfile(id: string, p: StoredProfile, primaryProfileId: string | null): Profile {
    return {
      id,
      name: p.name,
      relation: p.relation,
      birthDate: p.birthDate,
      timeKnown: p.timeKnown,
      birthTime: p.birthTime,
      place: p.place,
      utcOffsetMinutes: p.utcOffsetMinutes,
      offsetChoice: p.offsetChoice,
      timeAssumedNoon: p.timeAssumedNoon,
      isPrimary: id === primaryProfileId,
      createdAt: toIso(p.createdAt),
      updatedAt: toIso(p.updatedAt),
    };
  }

  private async primaryProfileId(uid: string): Promise<string | null> {
    const value: unknown = (await this.userRef(uid).get()).get('primaryProfileId');
    return typeof value === 'string' ? value : null;
  }

  private async load(uid: string, profileId: string): Promise<StoredProfile> {
    const snapshot = await this.profileRef(uid, profileId).get();
    if (!snapshot.exists) throw AppError.notFound();
    const parsed = storedProfileSchema.safeParse(snapshot.data());
    if (!parsed.success) throw new Error('stored profile is invalid', { cause: parsed.error });
    return parsed.data;
  }

  async list(uid: string): Promise<Profile[]> {
    const [snapshot, primary] = await Promise.all([
      this.userRef(uid).collection('profiles').orderBy('createdAt').get(),
      this.primaryProfileId(uid),
    ]);
    return snapshot.docs.map((doc) =>
      this.toProfile(doc.id, storedProfileSchema.parse(doc.data()), primary),
    );
  }

  async get(uid: string, profileId: string): Promise<Profile> {
    const [stored, primary] = await Promise.all([
      this.load(uid, profileId),
      this.primaryProfileId(uid),
    ]);
    return this.toProfile(profileId, stored, primary);
  }

  async create(uid: string, input: ProfileCreateInput): Promise<Profile> {
    await this.deps.users.requireConsent(uid);
    const place = await this.deps.places.resolvePlace(input.placeId);
    const birth = this.resolveBirth({
      birthDate: input.birthDate,
      timeKnown: input.timeKnown,
      birthTime: input.birthTime,
      place,
      offsetChoice: input.offsetChoice ?? null,
    });

    const at = Timestamp.fromDate(this.now());
    const profileRef = this.userRef(uid).collection('profiles').doc();
    const stored: StoredProfile = {
      name: input.name,
      relation: input.relation,
      ...birth,
      createdAt: at,
      updatedAt: at,
      schemaVersion: PROFILE_SCHEMA_VERSION,
    };

    // The cap and the counter change in one transaction, so concurrent creates cannot exceed it.
    const primary = await this.deps.db.runTransaction(async (tx) => {
      const user = await tx.get(this.userRef(uid));
      const count = Number(user.get('profileCount') ?? 0);
      if (count >= MAX_PROFILES_PER_USER) {
        throw new AppError('PROFILE_LIMIT_REACHED', 409, 'You can save up to 5 profiles');
      }
      const currentPrimary: unknown = user.get('primaryProfileId');
      const nextPrimary = typeof currentPrimary === 'string' ? currentPrimary : profileRef.id;
      tx.create(profileRef, stored);
      tx.update(this.userRef(uid), {
        profileCount: count + 1,
        primaryProfileId: nextPrimary,
        updatedAt: at,
      });
      return nextPrimary;
    });
    return this.toProfile(profileRef.id, stored, primary);
  }

  async update(uid: string, profileId: string, input: ProfileUpdateInput): Promise<Profile> {
    const current = await this.load(uid, profileId);
    const touchesBirth =
      input.birthDate !== undefined ||
      input.timeKnown !== undefined ||
      input.placeId !== undefined ||
      input.offsetChoice !== undefined;

    let next: StoredProfile = {
      ...current,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.relation !== undefined ? { relation: input.relation } : {}),
      updatedAt: Timestamp.fromDate(this.now()),
    };
    if (touchesBirth) {
      const place = input.placeId
        ? await this.deps.places.resolvePlace(input.placeId)
        : current.place;
      next = {
        ...next,
        ...this.resolveBirth({
          birthDate: input.birthDate ?? current.birthDate,
          timeKnown: input.timeKnown ?? current.timeKnown,
          birthTime: input.timeKnown !== undefined ? (input.birthTime ?? null) : current.birthTime,
          place,
          offsetChoice:
            input.offsetChoice !== undefined ? input.offsetChoice : current.offsetChoice,
        }),
      };
    }

    await this.profileRef(uid, profileId).set(next);
    if (next.inputHash !== current.inputHash) {
      // Readings for the old birth data are now wrong. They are never served (lookups compare
      // inputHash), but delete them so stale personal data does not linger.
      await this.deleteReadings(uid, profileId);
    }
    return this.toProfile(profileId, next, await this.primaryProfileId(uid));
  }

  async delete(uid: string, profileId: string): Promise<void> {
    const ref = this.profileRef(uid, profileId);
    const at = this.now();
    await this.deps.db.runTransaction(async (tx) => {
      const [profile, user] = await Promise.all([tx.get(ref), tx.get(this.userRef(uid))]);
      if (!profile.exists) throw AppError.notFound();

      let primary: unknown = user.get('primaryProfileId');
      if (primary === profileId) {
        // Promote the oldest remaining profile, or clear the primary if none remain.
        const others = await tx.get(
          this.userRef(uid).collection('profiles').orderBy('createdAt').limit(2),
        );
        primary = others.docs.find((d) => d.id !== profileId)?.id ?? null;
      }
      tx.delete(ref);
      tx.update(this.userRef(uid), {
        profileCount: FieldValue.increment(-1),
        primaryProfileId: primary,
        updatedAt: Timestamp.fromDate(at),
      });
      auditInTransaction(this.deps.db, tx, {
        type: 'profile_deleted',
        uidHash: uidHash(uid, this.deps.pepper),
        at,
      });
    });
    await this.deleteReadings(uid, profileId);
  }

  private async deleteReadings(uid: string, profileId: string): Promise<void> {
    const ref = this.profileRef(uid, profileId);
    await Promise.all([
      this.deps.db.recursiveDelete(ref.collection('results')),
      this.deps.db.recursiveDelete(ref.collection('predictions')),
    ]);
  }

  /** Birth data in provider form, for chart/dasha/prediction modules. */
  async loadForReadings(uid: string, profileId: string): Promise<ProfileForReadings> {
    const p = await this.load(uid, profileId);
    const { hour, minute } = p.birthTime ?? { hour: 12, minute: 0 };
    return {
      profileId,
      inputHash: p.inputHash,
      timeKnown: p.timeKnown,
      timeAssumedNoon: p.timeAssumedNoon,
      birth: {
        date: p.birthDate,
        time: { hour, minute },
        lat: p.place.lat,
        lon: p.place.lon,
        utcOffsetMinutes: p.utcOffsetMinutes,
      },
    };
  }
}
