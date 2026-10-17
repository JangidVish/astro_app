import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AuthError } from '@/auth/auth-service';
import { t } from '@/i18n/en';
import { EmailPasswordForm } from './email-password-form';

async function setup(mode: 'signIn' | 'signUp', onSubmit = jest.fn(() => Promise.resolve())) {
  await render(<EmailPasswordForm mode={mode} onSubmit={onSubmit} />);
  return {
    onSubmit,
    email: screen.getByLabelText(t('auth.email')),
    password: screen.getByLabelText(t('auth.password')),
    submit: screen.getByRole('button', {
      name: t(mode === 'signIn' ? 'auth.signIn.submit' : 'auth.signUp.submit'),
    }),
  };
}

describe('EmailPasswordForm', () => {
  it('exposes labelled fields and a named submit button to screen readers', async () => {
    const { email, password, submit } = await setup('signIn');
    expect(email).toBeTruthy();
    expect(password).toBeTruthy();
    expect(submit).toBeTruthy();
  });

  it('shows field errors and does not submit when empty', async () => {
    const { submit, onSubmit } = await setup('signIn');
    await fireEvent.press(submit);
    expect(await screen.findByText(t('auth.error.invalidEmail'))).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sign-up enforces the 8-character minimum before calling the server', async () => {
    const { email, password, submit, onSubmit } = await setup('signUp');
    await fireEvent.changeText(email, 'asha@example.com');
    await fireEvent.changeText(password, 'short');
    await fireEvent.press(submit);
    expect(await screen.findByText(t('auth.error.passwordTooShort'))).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid input', async () => {
    const { email, password, submit, onSubmit } = await setup('signIn');
    await fireEvent.changeText(email, 'asha@example.com');
    await fireEvent.changeText(password, 'correct-horse');
    await fireEvent.press(submit);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('asha@example.com', 'correct-horse');
    });
  });

  it('shows a generic credentials message for a wrong password', async () => {
    const onSubmit = jest.fn(() => Promise.reject(new AuthError('invalid_credentials')));
    const { email, password, submit } = await setup('signIn', onSubmit);
    await fireEvent.changeText(email, 'asha@example.com');
    await fireEvent.changeText(password, 'wrong-password');
    await fireEvent.press(submit);
    expect(await screen.findByText(t('auth.error.invalidCredentials'))).toBeTruthy();
  });

  it('disables the button while submitting (no double submits)', async () => {
    let finish: () => void = () => undefined;
    const onSubmit = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { email, password, submit } = await setup('signIn', onSubmit);
    await fireEvent.changeText(email, 'asha@example.com');
    await fireEvent.changeText(password, 'correct-horse');
    await fireEvent.press(submit);
    await waitFor(() => {
      expect(screen.getByTestId('submit').props.accessibilityState).toMatchObject({
        disabled: true,
        busy: true,
      });
    });
    await fireEvent.press(screen.getByTestId('submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => {
      expect(screen.getByTestId('submit').props.accessibilityState).toMatchObject({
        disabled: false,
      });
    });
  });
});
