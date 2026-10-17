/// <reference types="node" />
// Automated accessibility audit (T8.8). Renders every interactive component and checks each
// pressable element for: an accessibility role, an accessible name, and a 44 pt touch target.
// Also guards against raw colours outside the contrast-tested theme tokens.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type { ChartHouse, DashaPeriod, Place, PlanetPosition, Profile } from '@astro/shared';
import { SIGNS } from '@astro/shared';
import { AuthProvider } from '@/auth/auth-context';
import type { AuthService } from '@/auth/auth-service';
import { Button } from '@/components/form';
import { DeleteAccount } from '@/features/account/delete-account';
import { EmailPasswordForm } from '@/features/auth/email-password-form';
import { NorthIndianChart } from '@/features/chart/north-indian-chart';
import { PlanetTable } from '@/features/chart/planet-table';
import { emptyForm } from '@/features/profiles/form-model';
import { ProfileCard } from '@/features/profiles/profile-card';
import { ProfileForm } from '@/features/profiles/profile-form';
import { DashaList } from '@/features/readings/dasha-list';
import type { ApiClient } from '@/lib/api-client';
import { ApiProvider } from '@/lib/api-context';
import { MIN_TOUCH } from '@/theme/tokens';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const mumbai: Place = {
  placeId: 'pl_aaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'Mumbai',
  countryCode: 'IN',
  lat: 19.07,
  lon: 72.88,
  timezoneId: 'Asia/Kolkata',
};
const profile: Profile = {
  id: 'abcdefghijklmnopqrst',
  name: 'Asha Rao',
  relation: 'self',
  birthDate: { year: 1990, month: 5, day: 10 },
  timeKnown: true,
  birthTime: { hour: 19, minute: 55 },
  place: mumbai,
  utcOffsetMinutes: 330,
  offsetChoice: null,
  timeAssumedNoon: false,
  isPrimary: true,
  createdAt: '2026-10-17T12:00:00Z',
  updatedAt: '2026-10-17T12:00:00Z',
};
const houses: ChartHouse[] = SIGNS.map((sign, i) => ({
  house: i + 1,
  sign,
  signNumber: i + 1,
  bodies: i === 0 ? ['Sun'] : [],
}));
const planets: PlanetPosition[] = [
  {
    body: 'Sun',
    sign: 'Aries',
    signNumber: 1,
    degreeInSign: 10,
    fullDegree: 10,
    nakshatra: 'Ashwini',
    nakshatraPada: 3,
    house: 1,
    isRetrograde: false,
  },
];
const periods: DashaPeriod[] = [
  { lord: 'Ketu', start: '2024-08-23T13:24:00Z', end: '2031-08-24T07:24:00Z' },
];

const authService: AuthService = {
  onAuthStateChanged: (l) => {
    l({ uid: 'u', email: 'a@b.co', providers: ['password'] });
    return () => undefined;
  },
  signInWithEmail: () => Promise.resolve(),
  signUpWithEmail: () => Promise.resolve(),
  sendPasswordReset: () => Promise.resolve(),
  google: null,
  apple: null,
  signOut: () => Promise.resolve(),
  getIdToken: () => Promise.resolve('t'),
  reauthenticate: () => Promise.resolve(),
};

function Providers({ children }: { children: ReactNode }) {
  const api = { getAntardashas: () => new Promise(() => undefined) } as unknown as ApiClient;
  return (
    <AuthProvider service={authService}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
        }
      >
        <ApiProvider getIdToken={() => Promise.resolve('t')} client={api}>
          {children}
        </ApiProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

const noop = () => Promise.resolve();
const COMPONENTS: [string, ReactElement][] = [
  ['Button', <Button key="b" label="Save" onPress={() => undefined} />],
  ['EmailPasswordForm', <EmailPasswordForm key="e" mode="signUp" onSubmit={noop} />],
  [
    'ProfileForm',
    <ProfileForm
      key="p"
      initial={{ ...emptyForm, place: mumbai }}
      submitLabel="Save"
      onSubmit={noop}
    />,
  ],
  ['ProfileCard', <ProfileCard key="c" profile={profile} onPress={() => undefined} />],
  [
    'DashaList',
    <DashaList key="d" profileId="p" periods={periods} now={new Date('2026-10-17T12:00:00Z')} />,
  ],
  ['PlanetTable', <PlanetTable key="t" planets={planets} />],
  [
    'NorthIndianChart',
    <NorthIndianChart key="n" houses={houses} planets={planets} title="D1" size={300} />,
  ],
  ['DeleteAccount', <DeleteAccount key="x" onDeleted={() => undefined} />],
];

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] | null };

function textOf(node: Node | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(textOf).join('');
}

function collectPressables(node: Node | string | null, out: Node[] = []): Node[] {
  if (!node || typeof node === 'string') return out;
  if (typeof node.props['onPress'] === 'function' || node.props['onClick'] !== undefined)
    out.push(node);
  for (const child of node.children ?? []) collectPressables(child, out);
  return out;
}

describe.each(COMPONENTS)('a11y audit: %s', (_name, element) => {
  it('every pressable has a role, an accessible name and a 44 pt target', async () => {
    await render(element, { wrapper: Providers });
    const tree = screen.toJSON() as Node | Node[] | null;
    const roots = Array.isArray(tree) ? tree : [tree];
    const pressables = roots.flatMap((r) => collectPressables(r));
    for (const p of pressables) {
      const name = (p.props['accessibilityLabel'] as string | undefined) ?? textOf(p);
      const role = p.props['accessibilityRole'];
      expect({ role: role ?? null, hasName: name.trim().length > 0 }).toEqual({
        role: expect.any(String),
        hasName: true,
      });
      const style = StyleSheet.flatten(p.props['style'] as never) as
        { minHeight?: number; height?: number } | undefined;
      const height = Math.max(style?.minHeight ?? 0, style?.height ?? 0);
      expect(height).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });
});

describe('theme discipline', () => {
  it('no raw hex colours outside the theme tokens (all colours are contrast-tested)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== 'theme' && entry !== '__snapshots__') walk(path);
        } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          if (/['"]#[0-9A-Fa-f]{3,8}['"]/.test(readFileSync(path, 'utf8'))) offenders.push(path);
        }
      }
    };
    walk(join(__dirname));
    expect(offenders).toEqual([]);
  });
});
