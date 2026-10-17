import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';

export type AuditEventType =
  | 'account_created'
  | 'account_deleted'
  | 'profile_deleted'
  | 'quota_exceeded'
  | 'provider_auth_failed';

/** Audit events expire after 180 days via a Firestore TTL policy on `expireAt` (data-model 2.6). */
const AUDIT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

function auditDoc(db: Firestore, event: AuditEvent) {
  return {
    ref: db.collection('auditEvents').doc(),
    data: {
      type: event.type,
      uidHash: event.uidHash,
      at: Timestamp.fromDate(event.at),
      expireAt: Timestamp.fromMillis(event.at.getTime() + AUDIT_RETENTION_MS),
    },
  };
}

export interface AuditEvent {
  type: AuditEventType;
  /** Pseudonymous id (HMAC of the uid); never the uid or any personal data. */
  uidHash: string;
  at: Date;
}

/** Records an audit event as part of a transaction, so it commits or rolls back with it. */
export function auditInTransaction(db: Firestore, tx: Transaction, event: AuditEvent): void {
  const { ref, data } = auditDoc(db, event);
  tx.create(ref, data);
}

/** Records an audit event on its own. */
export async function writeAuditEvent(db: Firestore, event: AuditEvent): Promise<void> {
  const { ref, data } = auditDoc(db, event);
  await ref.create(data);
}
