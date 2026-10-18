import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Config } from '../../../common/config.js';
import { ProviderError } from '../errors.js';
import { createProvider } from '../factory.js';
import type { BirthInput } from '../provider.js';
import { AstrologyApiProvider } from './astrologyapi-provider.js';
import { AstrologyApiClient, type ProviderCallRecord } from './client.js';

function sample(name: string): unknown {
  const url = new URL(
    `../../../../test/fixtures/provider/astrologyapi/${name}.sample.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

const BIRTH: BirthInput = {
  date: { year: 1990, month: 5, day: 10 },
  time: { hour: 19, minute: 55 },
  lat: 19.0728,
  lon: 72.8826,
  utcOffsetMinutes: 330,
};

interface Sent {
  url: string;
  body: Record<string, unknown>;
}

/** Provider backed by a fake fetch that answers each endpoint with a given JSON value. */
function providerWith(responses: Record<string, unknown>) {
  const sent: Sent[] = [];
  const fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const text = typeof init.body === 'string' ? init.body : '';
    sent.push({ url, body: JSON.parse(text) as Record<string, unknown> });
    const endpoint = url.replace('https://json.astrologyapi.com/v1/', '');
    if (!(endpoint in responses)) return Promise.resolve(new Response('{}', { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(responses[endpoint]), { status: 200 }));
  }) as typeof globalThis.fetch;
  const client = new AstrologyApiClient({ userId: 'u', apiKey: 'k', fetch, retryDelaysMs: [] });
  return { provider: new AstrologyApiProvider(client), sent };
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error.kind;
    throw error;
  }
  return 'no error';
}

describe('AstrologyApiProvider: requests', () => {
  it('sends birth data with tzone in hours', async () => {
    const { provider, sent } = providerWith({ planets: sample('planets') });
    await provider.getPlanets(BIRTH);
    expect(sent[0]?.body).toEqual({
      day: 10,
      month: 5,
      year: 1990,
      hour: 19,
      min: 55,
      lat: 19.0728,
      lon: 72.8826,
      tzone: 5.5,
    });
  });

  it('handles 45-minute and negative offsets', async () => {
    const { provider, sent } = providerWith({ planets: sample('planets') });
    await provider.getPlanets({ ...BIRTH, utcOffsetMinutes: 345 });
    await provider.getPlanets({ ...BIRTH, utcOffsetMinutes: -210 });
    expect(sent.map((s) => s.body['tzone'])).toEqual([5.75, -3.5]);
  });

  it('uses the documented endpoints and lowercase mahadasha path', async () => {
    const { provider, sent } = providerWith({
      'horo_chart/D9': sample('horo_chart'),
      'sub_vdasha/sun': sample('sub_vdasha'),
      'daily_nakshatra_prediction/next': sample('daily_nakshatra_prediction_next'),
      daily_nakshatra_prediction: sample('daily_nakshatra_prediction'),
      geo_details: sample('geo_details'),
      timezone_with_dst: sample('timezone_with_dst'),
    });
    await provider.getChart(BIRTH, 'D9');
    await provider.getSubDasha(BIRTH, 'Sun');
    await provider.getDailyPrediction(BIRTH, 'next');
    await provider.getDailyPrediction(BIRTH, 'today');
    await provider.searchPlaces('mum', 5);
    await provider.getTimezoneOffset(25.7464, 82.6837, { year: 2000, month: 6, day: 7 });
    expect(sent.map((s) => s.url.replace('https://json.astrologyapi.com/v1/', ''))).toEqual([
      'horo_chart/D9',
      'sub_vdasha/sun',
      'daily_nakshatra_prediction/next',
      'daily_nakshatra_prediction',
      'geo_details',
      'timezone_with_dst',
    ]);
    expect(sent[4]?.body).toEqual({ place: 'mum', maxRows: 5 });
    expect(sent[5]?.body).toEqual({ latitude: 25.7464, longitude: 82.6837, date: '06-07-2000' });
  });
});

describe('AstrologyApiProvider: results', () => {
  it('returns mapped data, the untouched raw response and the source', async () => {
    const raw = sample('major_vdasha');
    const { provider } = providerWith({ major_vdasha: raw });
    const result = await provider.getMajorDasha(BIRTH);
    expect(result.source).toBe('astrologyapi');
    expect(result.endpoint).toBe('major_vdasha');
    expect(result.raw).toEqual(raw);
    expect(result.data[0]?.lord).toBe('Ketu');
  });

  it('maps every documented sample through the provider', async () => {
    const { provider } = providerWith({
      birth_details: sample('birth_details'),
      planets: sample('planets'),
      'horo_chart/D1': sample('horo_chart'),
      major_vdasha: sample('major_vdasha'),
      daily_nakshatra_prediction: sample('daily_nakshatra_prediction'),
    });
    expect((await provider.getBirthDetails(BIRTH)).data.ayanamsa).toBeGreaterThan(23);
    expect((await provider.getPlanets(BIRTH)).data).toHaveLength(10);
    expect((await provider.getChart(BIRTH, 'D1')).data).toHaveLength(12);
    expect((await provider.getMajorDasha(BIRTH)).data).toHaveLength(9);
    expect((await provider.getDailyPrediction(BIRTH, 'today')).data.forDate).toBe('2017-07-07');
  });
});

describe('AstrologyApiProvider: malformed responses', () => {
  it('schema failure -> malformed', async () => {
    const { provider } = providerWith({ planets: { unexpected: 'shape' } });
    expect(await kindOf(provider.getPlanets(BIRTH))).toBe('malformed');
  });

  it('mapping failure (consistency check) -> malformed', async () => {
    const chart = sample('horo_chart') as unknown[];
    const { provider } = providerWith({ 'horo_chart/D1': chart.slice(0, 11) });
    expect(await kindOf(provider.getChart(BIRTH, 'D1'))).toBe('malformed');
  });

  it('wrong Mahadasha data for the requested lord -> malformed', async () => {
    const { provider } = providerWith({ 'sub_vdasha/venus': sample('sub_vdasha') });
    expect(await kindOf(provider.getSubDasha(BIRTH, 'Venus'))).toBe('malformed');
  });

  it('HTTP errors pass through from the client', async () => {
    const { provider } = providerWith({});
    expect(await kindOf(provider.getPlanets(BIRTH))).toBe('bad_request');
  });
});

describe('createProvider: real provider', () => {
  const config: Config = {
    env: 'staging',
    port: 8080,
    logLevel: 'silent',
    provider: { kind: 'astrologyapi', userId: 'u', apiKey: 'k' },
    uidHashPepper: randomBytes(32),
    firebaseProjectId: 'p',
    appCheckEnforced: true,
    quotaProviderCallsPerDay: 30,
    listenOnLan: false,
  };

  it('builds AstrologyApiProvider with the call hook wired through', async () => {
    const records: ProviderCallRecord[] = [];
    const fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(sample('birth_details')), { status: 200 }),
      )) as typeof globalThis.fetch;
    const provider = createProvider(config, { onCall: (r) => records.push(r), fetch });
    expect(provider).toBeInstanceOf(AstrologyApiProvider);
    await provider.getBirthDetails(BIRTH);
    expect(records).toMatchObject([
      { endpoint: 'birth_details', attempt: 1, status: 200, errorKind: null },
    ]);
  });
});
