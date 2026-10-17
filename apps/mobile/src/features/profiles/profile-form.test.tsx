import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { Place, Profile } from '@astro/shared';
import { ApiError, type ApiClient } from '@/lib/api-client';
import { ApiProvider } from '@/lib/api-context';
import { t } from '@/i18n/en';
import { emptyForm, type ProfileFormState } from './form-model';
import { ProfileCard } from './profile-card';
import { ProfileForm } from './profile-form';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const mumbai: Place = {
  placeId: 'pl_aaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'Mumbai',
  countryCode: 'IN',
  lat: 19.07,
  lon: 72.88,
  timezoneId: 'Asia/Kolkata',
};
const newYork: Place = {
  placeId: 'pl_bbbbbbbbbbbbbbbbbbbbbbbb',
  name: 'New York',
  countryCode: 'US',
  lat: 40.71,
  lon: -74.0,
  timezoneId: 'America/New_York',
};

function wrapper(api: Partial<ApiClient>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiProvider getIdToken={() => Promise.resolve(null)} client={api as ApiClient}>
          {children}
        </ApiProvider>
      </QueryClientProvider>
    );
  };
}

async function renderForm(
  initial: ProfileFormState,
  onSubmit = jest.fn(() => Promise.resolve()),
  api: Partial<ApiClient> = {},
) {
  await render(<ProfileForm initial={initial} submitLabel="Save" onSubmit={onSubmit} />, {
    wrapper: wrapper(api),
  });
  return onSubmit;
}

const complete: ProfileFormState = {
  ...emptyForm,
  name: 'Asha Rao',
  birthDate: { year: 1990, month: 5, day: 10 },
  birthTime: { hour: 19, minute: 55 },
  place: mumbai,
};

describe('ProfileForm', () => {
  it('shows the resolved time zone and submits a valid profile', async () => {
    const onSubmit = await renderForm(complete);
    expect(screen.getByTestId('offset-preview')).toHaveTextContent(/UTC\+05:30/);
    await fireEvent.press(screen.getByTestId('save'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ placeId: mumbai.placeId, birthTime: { hour: 19, minute: 55 } }),
      );
    });
  });

  it('turning off "I know the time" hides the time field and explains the limits', async () => {
    await renderForm(complete);
    expect(screen.getByTestId('birth-time')).toBeTruthy();
    await fireEvent(screen.getByTestId('time-known'), 'valueChange', false);
    expect(screen.queryByTestId('birth-time')).toBeNull();
    expect(screen.getByText(t('profile.timeUnknownNote'))).toBeTruthy();
  });

  it('asks which occurrence for a repeated DST hour, then submits the choice', async () => {
    const onSubmit = await renderForm({
      ...complete,
      place: newYork,
      birthDate: { year: 2021, month: 11, day: 7 },
      birthTime: { hour: 1, minute: 30 },
    });
    expect(screen.getByText(t('profile.ambiguous.title'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('save'));
    expect(await screen.findByText(t('profile.error.ambiguous'))).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText(`${t('profile.ambiguous.second')} (UTC−05:00)`));
    await fireEvent.press(screen.getByTestId('save'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ offsetChoice: 'later' }));
    });
  });

  it('explains a DST gap instead of submitting', async () => {
    const onSubmit = await renderForm({
      ...complete,
      place: newYork,
      birthDate: { year: 2021, month: 3, day: 14 },
      birthTime: { hour: 2, minute: 30 },
    });
    expect(screen.getAllByText(t('profile.error.gap')).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('save'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows server field errors next to the field', async () => {
    const onSubmit = jest.fn(() =>
      Promise.reject(
        new ApiError('VALIDATION_FAILED', 400, 'x', false, [
          { path: 'placeId', code: 'PLACE_NOT_RESOLVED' },
        ]),
      ),
    );
    await renderForm(complete, onSubmit);
    await fireEvent.press(screen.getByTestId('save'));
    expect(await screen.findByText(t('profile.error.place'))).toBeTruthy();
  });

  it('shows the profile-limit message', async () => {
    const onSubmit = jest.fn(() =>
      Promise.reject(new ApiError('PROFILE_LIMIT_REACHED', 409, 'x', false)),
    );
    await renderForm(complete, onSubmit);
    await fireEvent.press(screen.getByTestId('save'));
    expect(await screen.findByText(t('profile.error.limit'))).toBeTruthy();
  });

  it('searches places after a pause (debounced, 3+ characters) and lets the user pick one', async () => {
    jest.useFakeTimers();
    const searchPlaces = jest.fn(() => Promise.resolve({ places: [mumbai] }));
    await renderForm({ ...complete, place: null }, undefined, { searchPlaces });

    await fireEvent.changeText(screen.getByTestId('place-query'), 'mu');
    await act(() => jest.advanceTimersByTimeAsync(500));
    expect(searchPlaces).not.toHaveBeenCalled(); // too short

    await fireEvent.changeText(screen.getByTestId('place-query'), 'mum');
    await fireEvent.changeText(screen.getByTestId('place-query'), 'mumb');
    await act(() => jest.advanceTimersByTimeAsync(500));
    expect(searchPlaces).toHaveBeenCalledTimes(1); // only the final value after the pause
    expect(searchPlaces).toHaveBeenCalledWith('mumb');

    await fireEvent.press(await screen.findByLabelText('Mumbai, IN, Asia/Kolkata'));
    expect(screen.getByText(t('profile.change'))).toBeTruthy();
    jest.useRealTimers();
  });
});

describe('ProfileCard', () => {
  const profile: Profile = {
    id: 'abcdefghijklmnopqrst',
    name: 'Asha Rao',
    relation: 'self',
    birthDate: { year: 1990, month: 5, day: 10 },
    timeKnown: false,
    birthTime: null,
    place: mumbai,
    utcOffsetMinutes: 330,
    offsetChoice: null,
    timeAssumedNoon: true,
    isPrimary: true,
    createdAt: '2026-10-17T12:00:00Z',
    updatedAt: '2026-10-17T12:00:00Z',
  };

  it('is one accessible button summarising the profile, including the time zone used', async () => {
    const onPress = jest.fn();
    await render(<ProfileCard profile={profile} onPress={onPress} />);
    const card = screen.getByRole('button');
    expect(card.props.accessibilityLabel).toBe(
      'Asha Rao, Me, Primary, 10 May 1990, Time unknown, Mumbai, IN',
    );
    expect(screen.getByText(/UTC\+05:30/)).toBeTruthy();
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledWith(profile.id);
  });
});
