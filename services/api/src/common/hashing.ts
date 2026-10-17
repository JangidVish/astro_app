import { createHash, createHmac } from 'node:crypto';

/**
 * Pseudonymous user id for logs, audit events and provider call records.
 * Keyed with a secret pepper so log readers cannot map it back to a uid by hashing guesses.
 */
export function uidHash(uid: string, pepper: Buffer): string {
  return createHmac('sha256', pepper).update(uid, 'utf8').digest('base64url');
}

/** Plain SHA-256 hex, for content-derived keys such as profile input hashes and cache keys. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
