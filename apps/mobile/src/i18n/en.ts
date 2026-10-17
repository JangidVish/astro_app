/**
 * English strings. Every user-facing string goes through t() so translations can be added later
 * without touching screens (D7: English only for the MVP, i18n-ready).
 */
export const en = {
  'app.name': 'Astro',

  'auth.signIn.title': 'Sign in',
  'auth.signIn.submit': 'Sign in',
  'auth.signIn.noAccount': 'New here? Create an account',
  'auth.signIn.forgot': 'Forgot password?',
  'auth.signUp.title': 'Create account',
  'auth.signUp.submit': 'Create account',
  'auth.signUp.haveAccount': 'Already have an account? Sign in',
  'auth.reset.title': 'Reset password',
  'auth.reset.submit': 'Send reset link',
  'auth.reset.sent': 'If an account exists for that email, a reset link is on its way.',
  'auth.reset.back': 'Back to sign in',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.passwordHint': 'At least 8 characters',
  'auth.or': 'or',
  'auth.google': 'Continue with Google',
  'auth.apple': 'Sign in with Apple',
  'auth.signOut': 'Sign out',

  'auth.error.invalidEmail': 'Enter a valid email address.',
  'auth.error.passwordTooShort': 'Use at least 8 characters.',
  'auth.error.invalidCredentials': 'Email or password is incorrect.',
  'auth.error.emailInUse': 'An account already exists for this email. Try signing in.',
  'auth.error.weakPassword': 'Choose a stronger password.',
  'auth.error.tooManyAttempts': 'Too many attempts. Wait a moment and try again.',
  'auth.error.network': 'No connection. Check your internet and try again.',
  'auth.error.cancelled': 'Sign-in was cancelled.',
  'auth.error.unknown': 'Something went wrong. Please try again.',

  'consent.title': 'Before you begin',
  'consent.body':
    'To create birth charts we store the birth details you enter and send them to our astrology data provider. You can delete your account and all your data at any time from Settings.',
  'consent.privacy': 'Privacy policy',
  'consent.terms': 'Terms of use',
  'consent.disclaimer': 'Astrological readings are for guidance and entertainment.',
  'consent.accept': 'I agree',

  'common.loading': 'Loading',
  'common.retry': 'Try again',
  'common.error': 'Something went wrong.',
  'common.offline': 'No connection to the server.',
} as const;

export type MessageKey = keyof typeof en;

export function t(key: MessageKey): string {
  return en[key];
}
