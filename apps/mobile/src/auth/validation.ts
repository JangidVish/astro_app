import type { MessageKey } from '@/i18n/en';

export const MIN_PASSWORD_LENGTH = 8;

/** Pragmatic email check: one @, something on both sides, a dot in the domain, no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): MessageKey | null {
  return EMAIL.test(email.trim()) ? null : 'auth.error.invalidEmail';
}

export function validatePassword(password: string): MessageKey | null {
  return password.length >= MIN_PASSWORD_LENGTH ? null : 'auth.error.passwordTooShort';
}
