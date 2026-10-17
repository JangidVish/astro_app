import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { DashaPeriod, PredictionResponse } from '@astro/shared';
import { ApiError, type ApiClient } from '@/lib/api-client';
import { ApiProvider } from '@/lib/api-context';
import { t } from '@/i18n/en';
import { readingErrorMessage } from '@/features/chart/reading-error';
import { DashaList } from './dasha-list';
import { formatInstant, isCurrent, localIsoDate, periodYears } from './dates';
import { PredictionView } from './prediction-view';

const periods: DashaPeriod[] = [
  { lord: 'Saturn', start: '1988-08-23T13:24:00Z', end: '2007-08-24T07:24:00Z' },
  { lord: 'Mercury', start: '2007-08-24T07:24:00Z', end: '2024-08-23T13:24:00Z' },
  { lord: 'Ketu', start: '2024-08-23T13:24:00Z', end: '2031-08-24T07:24:00Z' },
];
const NOW = new Date('2026-10-17T12:00:00Z');

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

describe('date helpers', () => {
  it('isCurrent uses an inclusive start and exclusive end', () => {
    expect(isCurrent(periods[2]!, NOW)).toBe(true);
    expect(isCurrent(periods[1]!, NOW)).toBe(false);
    expect(isCurrent(periods[2]!, new Date(periods[2]!.start))).toBe(true);
    expect(isCurrent(periods[1]!, new Date(periods[1]!.end))).toBe(false);
  });

  it('formats dates unambiguously and period lengths in years', () => {
    expect(formatInstant('2024-08-23T13:24:00Z')).toMatch(/23 Aug 2024/);
    expect(periodYears(periods[2]!)).toBe('7.0 years');
  });

  it('local dates shift by whole days across month and year ends', () => {
    expect(localIsoDate(new Date(2026, 11, 31, 23, 0), 1)).toBe('2027-01-01');
    expect(localIsoDate(new Date(2026, 2, 1, 8, 0), -1)).toBe('2026-02-28');
    expect(localIsoDate(new Date(2026, 9, 17, 9, 0), 0)).toBe('2026-10-17');
  });
});

describe('DashaList', () => {
  const subPeriods: DashaPeriod[] = [
    { lord: 'Ketu', start: '2024-08-23T13:24:00Z', end: '2025-01-19T16:51:00Z' },
    { lord: 'Venus', start: '2025-01-19T16:51:00Z', end: '2026-03-21T19:51:00Z' },
    { lord: 'Sun', start: '2026-03-21T19:51:00Z', end: '2026-07-27T21:42:00Z' },
    { lord: 'Moon', start: '2026-07-27T21:42:00Z', end: '2027-02-26T07:11:00Z' },
  ];

  it('marks the current Mahadasha and Antardasha and opens the current one by default', async () => {
    const getAntardashas = jest.fn(() =>
      Promise.resolve({
        profileId: 'p',
        mahadasha: 'Ketu' as const,
        antardashas: subPeriods,
        fetchedAt: '2026-10-17T12:00:00Z',
      }),
    );
    await render(<DashaList profileId="p" periods={periods} now={NOW} />, {
      wrapper: wrapper({ getAntardashas }),
    });
    expect(screen.getByLabelText(/^Ketu, Mahadasha, .*, Current period$/)).toBeTruthy();
    expect(await screen.findByLabelText(/^Moon, Antardasha, .*, Current period$/)).toBeTruthy();
    expect(getAntardashas).toHaveBeenCalledWith('p', 'Ketu');
  });

  it('loads other sub-periods only when asked, once', async () => {
    const getAntardashas = jest.fn((_id: string, md: string) =>
      Promise.resolve({
        profileId: 'p',
        mahadasha: md as 'Saturn',
        antardashas: subPeriods,
        fetchedAt: '2026-10-17T12:00:00Z',
      }),
    );
    await render(<DashaList profileId="p" periods={periods} now={NOW} />, {
      wrapper: wrapper({ getAntardashas }),
    });
    await waitFor(() => {
      expect(getAntardashas).toHaveBeenCalledTimes(1); // current (Ketu) only
    });
    await fireEvent.press(screen.getByTestId('toggle-Saturn'));
    await waitFor(() => {
      expect(getAntardashas).toHaveBeenCalledWith('p', 'Saturn');
    });
    expect(screen.getByTestId('toggle-Saturn').props.accessibilityState).toMatchObject({
      expanded: true,
    });
  });

  it('shows a clear error, not invented periods, when sub-periods fail', async () => {
    const getAntardashas = jest.fn(() =>
      Promise.reject(new ApiError('PROVIDER_UNAVAILABLE', 503, 'x', true)),
    );
    await render(<DashaList profileId="p" periods={periods} now={NOW} />, {
      wrapper: wrapper({ getAntardashas }),
    });
    expect(await screen.findByText(t('reading.unavailable'))).toBeTruthy();
  });
});

describe('PredictionView', () => {
  const prediction: PredictionResponse = {
    profileId: 'p',
    date: '2026-10-17',
    moonSign: 'Aries',
    nakshatra: 'Ashwini',
    sections: {
      health: 'H text',
      emotions: 'E text',
      profession: 'P text',
      luck: 'L text',
      personalLife: 'PL text',
      travel: 'T text',
    },
    timeAssumedNoon: true,
    fetchedAt: '2026-10-17T12:00:00Z',
  };

  it('shows the basis, all six sections verbatim, the noon note and the disclaimer', async () => {
    await render(<PredictionView prediction={prediction} />);
    expect(screen.getByText('Aries · Ashwini')).toBeTruthy();
    for (const text of ['H text', 'E text', 'P text', 'L text', 'PL text', 'T text']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByText(t('chart.noonNote'))).toBeTruthy();
    expect(screen.getByText(t('consent.disclaimer'))).toBeTruthy();
  });

  it('omits the noon note when the birth time is known', async () => {
    await render(<PredictionView prediction={{ ...prediction, timeAssumedNoon: false }} />);
    expect(screen.queryByText(t('chart.noonNote'))).toBeNull();
  });
});

describe('prediction date not available', () => {
  it('maps the server window rejection to a helpful message', () => {
    const error = new ApiError('VALIDATION_FAILED', 400, 'x', false, [
      { path: 'date', code: 'PREDICTION_DATE_OUT_OF_RANGE' },
    ]);
    expect(readingErrorMessage(error)).toBe('prediction.notAvailable');
  });
});
