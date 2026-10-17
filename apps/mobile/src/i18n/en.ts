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

  'profiles.title': 'Profiles',
  'profiles.add': 'Add profile',
  'profiles.limit': 'You can save up to 5 profiles. Delete one to add another.',
  'profiles.empty': 'Add your birth details to see your chart.',
  'profiles.primary': 'Primary',
  'profiles.timeUnknown': 'Time unknown',
  'profiles.offset': 'Time zone used',
  'profile.new': 'New profile',
  'profile.edit': 'Edit profile',
  'profile.name': 'Name',
  'profile.relation': 'Relation',
  'profile.relation.self': 'Me',
  'profile.relation.partner': 'Partner',
  'profile.relation.family': 'Family',
  'profile.relation.friend': 'Friend',
  'profile.relation.other': 'Other',
  'profile.birthDate': 'Date of birth',
  'profile.birthTime': 'Time of birth',
  'profile.timeKnown': 'I know the exact birth time',
  'profile.timeUnknownNote':
    'Without the time we can show planet signs and your daily prediction, but not the ascendant, houses or dasha.',
  'profile.place': 'Place of birth',
  'profile.placeSearch': 'Search for a city or town',
  'profile.placeNoResults': 'No places found. Check the spelling or try a nearby larger town.',
  'profile.choose': 'Choose',
  'profile.change': 'Change',
  'profile.ambiguous.title': 'This time happened twice',
  'profile.ambiguous.body':
    'Clocks were turned back here that night, so this time occurred twice. Which one was it?',
  'profile.ambiguous.first': 'First occurrence',
  'profile.ambiguous.second': 'Second occurrence',
  'profile.offsetPreview': 'Time zone at birth',
  'profile.save': 'Save',
  'profile.delete': 'Delete profile',
  'profile.deleteConfirmTitle': 'Delete this profile?',
  'profile.deleteConfirmBody':
    'Its charts and readings will be deleted too. This cannot be undone.',
  'profile.cancel': 'Cancel',
  'profile.error.required': 'This is required.',
  'profile.error.name': 'Use letters only (1 to 60 characters).',
  'profile.error.date': 'Enter a valid date.',
  'profile.error.dateRange': 'Birth dates from 1900 onwards are supported.',
  'profile.error.future': 'The birth date and time cannot be in the future.',
  'profile.error.time': 'Enter a valid time.',
  'profile.error.gap':
    'Clocks jumped forward at this time in this place, so it never existed. Please check the time.',
  'profile.error.ambiguous': 'Choose which occurrence of this time it was.',
  'profile.error.place': 'Choose the place from the search results.',
  'profile.error.limit': 'You already have 5 profiles.',

  'common.loading': 'Loading',
  'common.retry': 'Try again',
  'common.error': 'Something went wrong.',
  'common.offline': 'No connection to the server.',
} as const;

export type MessageKey = keyof typeof en;

export function t(key: MessageKey): string {
  return en[key];
}
