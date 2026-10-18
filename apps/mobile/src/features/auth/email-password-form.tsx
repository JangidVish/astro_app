import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { TextInput } from 'react-native';
import { Button, ErrorBanner, TextField } from '@/components/form';
import { t } from '@/i18n/en';
import { messageFor } from '@/auth/messages';
import { validateEmail, validatePassword } from '@/auth/validation';

export interface EmailPasswordFormProps {
  mode: 'signIn' | 'signUp';
  onSubmit: (email: string, password: string) => Promise<void>;
  /** Shown between the password field and the submit button (e.g. "Forgot password?"). */
  beforeSubmit?: ReactNode;
}

/** Shared by sign-in and sign-up. Validates locally first; shows server errors in a banner. */
export function EmailPasswordForm({ mode, onSubmit, beforeSubmit }: EmailPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit() {
    const emailError = validateEmail(email);
    const passwordError =
      mode === 'signUp'
        ? validatePassword(password)
        : password
          ? null
          : 'auth.error.passwordTooShort';
    setFieldErrors({
      ...(emailError ? { email: t(emailError) } : {}),
      ...(passwordError ? { password: t(passwordError) } : {}),
    });
    setFormError(null);
    if (emailError || passwordError) return;

    setSubmitting(true);
    try {
      await onSubmit(email, password);
    } catch (error) {
      setFormError(t(messageFor(error)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <ErrorBanner message={formError} />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email ?? null}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder={t('auth.emailPlaceholder')}
        icon="alternate-email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        testID="email"
      />
      <TextField
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password ?? null}
        hint={mode === 'signUp' ? t('auth.passwordHint') : undefined}
        secureTextEntry
        revealable
        autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        testID="password"
      />
      {beforeSubmit}
      <Button
        label={t(mode === 'signUp' ? 'auth.signUp.submit' : 'auth.signIn.submit')}
        icon={mode === 'signUp' ? 'arrow-forward' : 'auto-awesome'}
        onPress={() => void submit()}
        loading={submitting}
        testID="submit"
      />
    </>
  );
}
