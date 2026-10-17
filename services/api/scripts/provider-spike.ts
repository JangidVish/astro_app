// T3.4 live verification against AstrologyAPI. SPENDS PROVIDER CREDITS (about 24 calls).
// Run manually only:  npx tsx --env-file=../../.env scripts/provider-spike.ts
//
// Uses synthetic birth data only (no real person). Prints findings and call metadata, never
// credentials. Saves raw responses as fixtures under test/fixtures/provider/astrologyapi/live/.
/* eslint-disable no-console -- CLI report */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { z } from 'zod';
import {
  AstrologyApiClient,
  type ProviderCallRecord,
} from '../src/modules/astrology-provider/astrologyapi/client.js';
import * as mappers from '../src/modules/astrology-provider/astrologyapi/mappers.js';
import * as schemas from '../src/modules/astrology-provider/astrologyapi/schemas.js';
import { ProviderError } from '../src/modules/astrology-provider/errors.js';

const userId = process.env['ASTROLOGYAPI_USER_ID'] ?? '';
const apiKey = process.env['ASTROLOGYAPI_API_KEY'] ?? '';
if (!userId || !apiKey || userId.startsWith('<') || apiKey.startsWith('<')) {
  console.error('ASTROLOGYAPI_USER_ID / ASTROLOGYAPI_API_KEY are not set (see .env.example).');
  process.exit(1);
}

const OUT_DIR = new URL('../test/fixtures/provider/astrologyapi/live/', import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

const records: ProviderCallRecord[] = [];
const headerLog: Record<string, Record<string, string>> = {};
let lastEndpoint = '';

/** fetch wrapper that remembers response headers (credit/rate info may be there). */
const recordingFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value;
  });
  headerLog[lastEndpoint] = headers;
  return response;
};

const client = new AstrologyApiClient({
  userId,
  apiKey,
  retryDelaysMs: [], // no retries: do not spend extra credits on failures
  fetch: recordingFetch,
  onCall: (record) => records.push(record),
});

type Outcome = { endpoint: string; ok: boolean; mapped?: unknown; error?: string };
const outcomes: Outcome[] = [];

async function probe<S extends z.ZodType, T>(
  fixtureName: string,
  endpoint: string,
  body: Record<string, unknown>,
  schema: S,
  map: (parsed: z.infer<S>) => T,
): Promise<{ raw: unknown; data: T | undefined }> {
  lastEndpoint = endpoint;
  let raw: unknown;
  try {
    raw = await client.post(endpoint, body);
  } catch (error) {
    const message =
      error instanceof ProviderError
        ? `${error.kind} (HTTP ${String(error.status)})`
        : String(error);
    outcomes.push({ endpoint, ok: false, error: message });
    return { raw: undefined, data: undefined };
  }
  writeFileSync(new URL(`${fixtureName}.json`, OUT_DIR), `${JSON.stringify(raw, null, 2)}\n`);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    outcomes.push({
      endpoint,
      ok: false,
      error: `schema: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join('; ')}`,
    });
    return { raw, data: undefined };
  }
  try {
    const data = map(parsed.data);
    outcomes.push({ endpoint, ok: true });
    return { raw, data };
  } catch (error) {
    outcomes.push({
      endpoint,
      ok: false,
      error: `mapping: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { raw, data: undefined };
  }
}

// ---------------------------------------------------------------- synthetic profile
const LOCAL = {
  day: 10,
  month: 5,
  year: 1990,
  hour: 19,
  min: 55,
  lat: 19.076,
  lon: 72.8777,
  tzone: 5.5,
};
const SAME_INSTANT_UTC = { ...LOCAL, hour: 14, min: 25, tzone: 0 };
const OFFSET = 330;

const findings: Record<string, unknown> = {};

const geo = await probe(
  'geo_details',
  'geo_details',
  { place: 'Mumbai', maxRows: 3 },
  schemas.geoDetailsSchema,
  mappers.mapGeoDetails,
);
findings['geo_first'] = geo.data?.[0];

const details = await probe(
  'birth_details',
  'birth_details',
  LOCAL,
  schemas.birthDetailsSchema,
  mappers.mapBirthDetails,
);
// Lahiri ayanamsa: about 23.853 deg at J2000, increasing about 50.29 arcsec per year.
const lahiriApprox = 23.853 + ((1990.36 - 2000) * 50.29) / 3600;
findings['ayanamsa'] = {
  provider: details.data?.ayanamsa,
  lahiriApprox: Number(lahiriApprox.toFixed(4)),
};

const planets = await probe('planets', 'planets', LOCAL, schemas.planetsSchema, mappers.mapPlanets);
await probe('horo_chart_D1', 'horo_chart/D1', LOCAL, schemas.horoChartSchema, mappers.mapChart);
await probe('horo_chart_D9', 'horo_chart/D9', LOCAL, schemas.horoChartSchema, mappers.mapChart);
const major = await probe('major_vdasha', 'major_vdasha', LOCAL, schemas.dashaSchema, (r) =>
  mappers.mapMajorDasha(r, OFFSET),
);

const now = Date.now();
const current = major.data?.find((p) => Date.parse(p.start) <= now && now < Date.parse(p.end));
if (current) {
  await probe(
    `sub_vdasha_${current.lord.toLowerCase()}`,
    `sub_vdasha/${current.lord.toLowerCase()}`,
    LOCAL,
    schemas.dashaSchema,
    (r) => mappers.mapSubDasha(r, OFFSET, current.lord),
  );
}
findings['birth_inside_first_mahadasha'] = major.data
  ? Date.parse(major.data[0]?.start ?? '') <= Date.UTC(1990, 4, 10, 14, 25) &&
    Date.UTC(1990, 4, 10, 14, 25) < Date.parse(major.data[0]?.end ?? '')
  : null;

const predictions: Record<string, string | undefined> = {};
for (const [name, endpoint] of [
  ['today', 'daily_nakshatra_prediction'],
  ['previous', 'daily_nakshatra_prediction/previous'],
  ['next', 'daily_nakshatra_prediction/next'],
] as const) {
  const result = await probe(
    `daily_nakshatra_prediction_${name}`,
    endpoint,
    LOCAL,
    schemas.dailyNakshatraPredictionSchema,
    mappers.mapDailyPrediction,
  );
  predictions[name] = result.data?.forDate;
}
findings['prediction_dates'] = {
  ...predictions,
  utcToday: new Date(now).toISOString().slice(0, 10),
  istToday: new Date(now + 330 * 60_000).toISOString().slice(0, 10),
};

// ---------------------------------------------------------------- same instant, tzone 0
const planetsUtc = await probe(
  'planets_same_instant_utc',
  'planets',
  SAME_INSTANT_UTC,
  schemas.planetsSchema,
  mappers.mapPlanets,
);
const majorUtc = await probe(
  'major_vdasha_same_instant_utc',
  'major_vdasha',
  SAME_INSTANT_UTC,
  schemas.dashaSchema,
  (r) => mappers.mapMajorDasha(r, 0),
);
findings['planets_identical_for_same_instant'] =
  planets.data && planetsUtc.data
    ? planets.data.every((p) => {
        const other = planetsUtc.data?.find((q) => q.body === p.body);
        return other && Math.abs((other.fullDegree ?? 0) - (p.fullDegree ?? 0)) < 1e-6;
      })
    : null;
const rawStartLocal = (major.raw as { start: string }[] | undefined)?.[0]?.start;
const rawStartUtc = (majorUtc.raw as { start: string }[] | undefined)?.[0]?.start;
findings['dasha_raw_first_start'] = { requestTzone5_5: rawStartLocal, requestTzone0: rawStartUtc };
findings['dasha_mapped_first_start_equal'] =
  major.data && majorUtc.data ? major.data[0]?.start === majorUtc.data[0]?.start : null;

// ---------------------------------------------------------------- "today" for a UTC+14 profile
const kiritimati = { ...LOCAL, lat: 1.8721, lon: -157.4278, tzone: 14 };
const plus14 = await probe(
  'daily_nakshatra_prediction_tzone14',
  'daily_nakshatra_prediction',
  kiritimati,
  schemas.dailyNakshatraPredictionSchema,
  mappers.mapDailyPrediction,
);
findings['prediction_date_for_tzone14'] = {
  provider: plus14.data?.forDate,
  plus14Today: new Date(now + 14 * 60 * 60_000).toISOString().slice(0, 10),
};

// ---------------------------------------------------------------- timezone cross-check
const COORDS: Record<string, [number, number]> = {
  'Asia/Kolkata': [22.5726, 88.3639],
  'Asia/Kathmandu': [27.7172, 85.324],
  'America/New_York': [40.7128, -74.006],
  'Europe/London': [51.5074, -0.1278],
  'America/Sao_Paulo': [-23.5505, -46.6333],
  'Asia/Dhaka': [23.8103, 90.4125],
  'Pacific/Kiritimati': [1.8721, -157.4278],
};
const tzFixture = JSON.parse(
  readFileSync(
    new URL('../../../packages/shared/test/fixtures/tz-cases.json', import.meta.url),
    'utf8',
  ),
) as {
  cases: { id: string; zone: string; date: string; expect: { status: string; offset?: number } }[];
};
const TZ_IDS = [
  'ist-war-1943',
  'madras-time-1900',
  'nepal-before-1986',
  'nepal-modern',
  'ny-summer',
  'ny-winter',
  'london-bst-all-year-1970',
  'london-double-summer-1941',
  'sao-paulo-dst-2018',
  'dhaka-dst-2009',
];
const tzResults: {
  id: string;
  ours: number | undefined;
  provider: number | undefined;
  match: boolean;
}[] = [];
for (const id of TZ_IDS) {
  const c = tzFixture.cases.find((x) => x.id === id);
  const coords = c ? COORDS[c.zone] : undefined;
  if (!c || !coords) continue;
  const [year, month, day] = c.date.split('-');
  const result = await probe(
    `timezone_with_dst_${id}`,
    'timezone_with_dst',
    {
      latitude: coords[0],
      longitude: coords[1],
      date: `${month ?? ''}-${day ?? ''}-${year ?? ''}`,
    },
    schemas.timezoneWithDstSchema,
    mappers.mapTimezoneOffset,
  );
  tzResults.push({
    id,
    ours: c.expect.offset,
    provider: result.data,
    match: result.data === c.expect.offset,
  });
}
findings['timezone_cross_check'] = tzResults;

// ---------------------------------------------------------------- wrong credentials
lastEndpoint = 'planets (wrong key)';
const badResponse = await globalThis.fetch('https://json.astrologyapi.com/v1/planets', {
  method: 'POST',
  headers: {
    authorization: `Basic ${Buffer.from(`${userId}:not-the-real-key`).toString('base64')}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(LOCAL),
});
findings['wrong_key'] = {
  status: badResponse.status,
  body: (await badResponse.text()).slice(0, 300),
};

// ---------------------------------------------------------------- report
const report = {
  ranAt: new Date(now).toISOString(),
  providerCalls: records.length + 1,
  outcomes,
  findings,
  responseHeaderNames: Object.fromEntries(
    Object.entries(headerLog).map(([k, v]) => [k, Object.keys(v)]),
  ),
  sampleHeaders: headerLog['birth_details'],
  latencyMs: records.map((r) => `${r.endpoint}:${String(r.latencyMs)}`),
};
// Scrub credentials in case any response or header echoed them.
const scrubbed = JSON.stringify(report, null, 2)
  .split(apiKey)
  .join('[REDACTED]')
  .split(userId)
  .join('[REDACTED]');
writeFileSync(new URL('_report.json', OUT_DIR), `${scrubbed}\n`);
console.log(scrubbed);
