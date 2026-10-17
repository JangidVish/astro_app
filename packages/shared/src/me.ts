import { z } from 'zod';
import { isoDateTime, personName } from './common.js';
import { DISPLAY_NAME_MAX } from './limits.js';

const policyVersion = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'VALIDATION_FAILED');

export const consentSchema = z.strictObject({
  privacyVersion: policyVersion,
  termsVersion: policyVersion,
  acceptedAt: isoDateTime,
});
export type Consent = z.infer<typeof consentSchema>;

/** GET /v1/me */
export const meResponseSchema = z.strictObject({
  displayName: z.string().nullable(),
  consent: consentSchema.nullable(),
  /** True when consent is missing or for an older policy version; profiles are blocked until accepted. */
  consentRequired: z.boolean(),
  primaryProfileId: z.string().nullable(),
  profileCount: z.number().int().min(0),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** PATCH /v1/me. At least one field. */
export const meUpdateInputSchema = z
  .strictObject({
    displayName: personName(DISPLAY_NAME_MAX).nullable().optional(),
    acceptConsent: z
      .strictObject({ privacyVersion: policyVersion, termsVersion: policyVersion })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'EMPTY_UPDATE');
export type MeUpdateInput = z.infer<typeof meUpdateInputSchema>;
