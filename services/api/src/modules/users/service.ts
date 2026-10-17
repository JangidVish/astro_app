import {
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  type MeResponse,
  type MeUpdateInput,
} from '@astro/shared';
import { AppError } from '../../common/errors.js';
import { uidHash } from '../../common/hashing.js';
import type { UserDoc, UsersRepository } from './repository.js';

export interface UsersServiceDeps {
  repository: UsersRepository;
  pepper: Buffer;
  now?: () => Date;
}

function consentIsCurrent(user: UserDoc): boolean {
  return (
    user.consent !== null &&
    user.consent.privacyVersion === PRIVACY_POLICY_VERSION &&
    user.consent.termsVersion === TERMS_VERSION
  );
}

function toResponse(user: UserDoc): MeResponse {
  return {
    displayName: user.displayName,
    consent: user.consent
      ? {
          privacyVersion: user.consent.privacyVersion,
          termsVersion: user.consent.termsVersion,
          acceptedAt: user.consent.acceptedAt.toDate().toISOString().replace('.000Z', 'Z'),
        }
      : null,
    consentRequired: !consentIsCurrent(user),
    primaryProfileId: user.primaryProfileId,
    profileCount: user.profileCount,
  };
}

export class UsersService {
  private readonly now: () => Date;

  constructor(private readonly deps: UsersServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Loads (creating on first use) an active user. A user being deleted is treated as signed out. */
  private async activeUser(uid: string): Promise<UserDoc> {
    const user = await this.deps.repository.getOrCreate(
      uid,
      uidHash(uid, this.deps.pepper),
      this.now(),
    );
    if (user.status !== 'active') {
      throw new AppError('UNAUTHENTICATED', 401, 'Authentication required');
    }
    return user;
  }

  async getMe(uid: string): Promise<MeResponse> {
    return toResponse(await this.activeUser(uid));
  }

  async updateMe(uid: string, input: MeUpdateInput): Promise<MeResponse> {
    await this.activeUser(uid);
    if (input.acceptConsent) {
      const { privacyVersion, termsVersion } = input.acceptConsent;
      if (privacyVersion !== PRIVACY_POLICY_VERSION || termsVersion !== TERMS_VERSION) {
        throw new AppError(
          'POLICY_VERSION_OUTDATED',
          409,
          'Please review and accept the current privacy policy and terms',
        );
      }
    }
    const updated = await this.deps.repository.update(
      uid,
      {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.acceptConsent ? { consent: input.acceptConsent } : {}),
      },
      this.now(),
    );
    return toResponse(updated);
  }

  /** Guard for features that need consent first (profile creation, T5.3). */
  async requireConsent(uid: string): Promise<void> {
    const user = await this.activeUser(uid);
    if (!consentIsCurrent(user)) {
      throw new AppError(
        'CONSENT_REQUIRED',
        403,
        'Please accept the privacy policy and terms first',
      );
    }
  }
}
