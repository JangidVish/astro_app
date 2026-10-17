import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRAHAS, chartHouseSchema, dashaPeriodSchema, planetPositionSchema } from '@astro/shared';
import {
  MappingError,
  mapBirthDetails,
  mapChart,
  mapDailyPrediction,
  mapGeoDetails,
  mapMajorDasha,
  mapPlanets,
  mapSubDasha,
  mapTimezoneOffset,
  parseDashaDate,
  parsePredictionDate,
} from './mappers.js';
import {
  birthDetailsSchema,
  dailyNakshatraPredictionSchema,
  dashaSchema,
  geoDetailsSchema,
  horoChartSchema,
  planetsSchema,
  timezoneWithDstSchema,
} from './schemas.js';

/** Documented AstrologyAPI sample responses (see test/fixtures/provider/astrologyapi). */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed fixture loader
function sample<T = unknown>(name: string): T {
  const url = new URL(
    `../../../../test/fixtures/provider/astrologyapi/${name}.sample.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}
const clone = <T>(value: T): T => structuredClone(value);

type Json = Record<string, unknown>;
const IST = 330;

describe('documented samples map cleanly', () => {
  it('geo_details: string longitudes become numbers', () => {
    const places = mapGeoDetails(geoDetailsSchema.parse(sample('geo_details')));
    expect(places[0]).toEqual({
      name: 'Mumbai',
      countryCode: 'IN',
      lat: 19.07283,
      lon: 72.88261,
      timezoneId: 'Asia/Kolkata',
    });
  });

  it('timezone_with_dst: hours become whole minutes', () => {
    expect(mapTimezoneOffset(timezoneWithDstSchema.parse(sample('timezone_with_dst')))).toBe(330);
    expect(mapTimezoneOffset({ timezone: 5.75 })).toBe(345);
    expect(mapTimezoneOffset({ timezone: -3.5 })).toBe(-210);
  });

  it('birth_details: ayanamsa in the Lahiri range', () => {
    const details = mapBirthDetails(birthDetailsSchema.parse(sample('birth_details')));
    expect(details.ayanamsa).toBeCloseTo(23.753, 3);
  });

  it('planets: 9 grahas + Ascendant, string and real booleans both handled', () => {
    const planets = mapPlanets(planetsSchema.parse(sample('planets')));
    expect(planets).toHaveLength(10);
    for (const p of planets) planetPositionSchema.parse(p);
    const byBody = new Map(planets.map((p) => [p.body, p]));
    expect(byBody.get('Sun')).toMatchObject({
      sign: 'Gemini',
      signNumber: 3,
      house: 9,
      nakshatraPada: 2,
      isRetrograde: false,
    });
    expect(byBody.get('Mercury')?.isRetrograde).toBe(true); // "true" string
    expect(byBody.get('Ascendant')).toMatchObject({ sign: 'Libra', house: 1, isRetrograde: false }); // real boolean
    expect(byBody.get('Ketu')?.nakshatra).toBe('Uttra Shadha'); // provider spelling kept
  });

  it('horo_chart: 12 houses from the Lagna, every graha once', () => {
    const chart = mapChart(horoChartSchema.parse(sample('horo_chart')));
    expect(chart).toHaveLength(12);
    for (const house of chart) chartHouseSchema.parse(house);
    expect(chart[0]).toMatchObject({ house: 1, sign: 'Libra', signNumber: 7, bodies: [] });
    expect(chart[7]).toMatchObject({ house: 8, sign: 'Taurus', bodies: ['Jupiter', 'Saturn'] });
    expect(chart.flatMap((h) => h.bodies).sort()).toEqual([...GRAHAS].sort());
  });

  it('chart and planets samples agree on every graha house', () => {
    const chart = mapChart(horoChartSchema.parse(sample('horo_chart')));
    const planets = mapPlanets(planetsSchema.parse(sample('planets')));
    for (const graha of GRAHAS) {
      const chartHouse = chart.find((h) => h.bodies.includes(graha))?.house;
      expect(chartHouse, graha).toBe(planets.find((p) => p.body === graha)?.house);
    }
  });

  it('major_vdasha: 9 contiguous periods, dates converted from birth-local to UTC', () => {
    const periods = mapMajorDasha(dashaSchema.parse(sample('major_vdasha')), IST);
    expect(periods).toHaveLength(9);
    for (const p of periods) dashaPeriodSchema.parse(p);
    // "2-5-1994 14:7" at UTC+05:30 is 08:37 UTC.
    expect(periods[0]).toEqual({
      lord: 'Ketu',
      start: '1994-05-02T08:37:00Z',
      end: '2001-05-02T02:37:00Z',
    });
  });

  it('sub_vdasha: starts with the Mahadasha lord', () => {
    const periods = mapSubDasha(dashaSchema.parse(sample('sub_vdasha')), IST, 'Sun');
    expect(periods[0]?.lord).toBe('Sun');
    expect(periods).toHaveLength(9);
  });

  it.each(['daily_nakshatra_prediction', 'daily_nakshatra_prediction_next'])(
    '%s: sections renamed and date parsed',
    (name) => {
      const prediction = mapDailyPrediction(dailyNakshatraPredictionSchema.parse(sample(name)));
      expect(prediction.forDate).toMatch(/^2017-0[67]-\d{2}$/);
      expect(Object.keys(prediction.sections).sort()).toEqual([
        'emotions',
        'health',
        'luck',
        'personalLife',
        'profession',
        'travel',
      ]);
      for (const text of Object.values(prediction.sections))
        expect(text.length).toBeGreaterThan(10);
    },
  );

  it('prediction date: "7 July 2017" -> 2017-07-07', () => {
    expect(parsePredictionDate('7 July 2017')).toBe('2017-07-07');
    expect(parsePredictionDate('18 june 2017')).toBe('2017-06-18');
  });
});

describe('schemas reject wrong types', () => {
  it.each<[string, () => unknown]>([
    ['isRetro "maybe"', () => planetsSchema.parse(patchPlanet(0, { isRetro: 'maybe' }))],
    ['fullDegree "abc"', () => planetsSchema.parse(patchPlanet(0, { fullDegree: 'abc' }))],
    [
      'fullDegree "1e5" (not a plain decimal)',
      () => planetsSchema.parse(patchPlanet(0, { fullDegree: '1e5' })),
    ],
    ['missing nakshatra', () => planetsSchema.parse(patchPlanet(0, { nakshatra: undefined }))],
    [
      'empty prediction section',
      () => dailyNakshatraPredictionSchema.parse(patchPrediction({ travel: '  ' })),
    ],
    [
      'dasha date in ISO format',
      () => dashaSchema.parse([{ planet: 'Sun', start: '2021-05-02', end: '2-5-2027 20:7' }]),
    ],
    ['geonames missing', () => geoDetailsSchema.parse({ places: [] })],
    [
      'prediction date "2017-07-07"',
      () =>
        dailyNakshatraPredictionSchema.parse({
          ...sample<Json>('daily_nakshatra_prediction'),
          prediction_date: '2017-07-07',
        }),
    ],
  ])('%s', (_label, run) => {
    expect(run).toThrow();
  });
});

function patchPlanet(index: number, patch: Json): Json[] {
  const planets = clone(sample<Json[]>('planets'));
  planets[index] = { ...planets[index], ...patch };
  return planets;
}

function patchPrediction(patch: Json): Json {
  const raw = clone(sample<Json & { prediction: Json }>('daily_nakshatra_prediction'));
  raw.prediction = { ...raw.prediction, ...patch };
  return raw;
}

function chartWith(
  mutate: (houses: { sign: number; sign_name: string; planet: string[] }[]) => void,
) {
  const houses = clone(horoChartSchema.parse(sample('horo_chart')));
  mutate(houses);
  return houses;
}

describe('mappers reject inconsistent data (malformed, never cached)', () => {
  it.each<[string, () => unknown]>([
    // charts
    ['chart with 11 houses', () => mapChart(chartWith((h) => h.pop()))],
    [
      'chart signs not consecutive',
      () =>
        mapChart(
          chartWith((h) => {
            if (h[3]) h[3].sign = 1;
          }),
        ),
    ],
    [
      'sign name contradicts number',
      () =>
        mapChart(
          chartWith((h) => {
            if (h[0]) h[0].sign_name = 'Aries';
          }),
        ),
    ],
    ['graha placed twice', () => mapChart(chartWith((h) => h[0]?.planet.push('SUN')))],
    [
      'graha missing',
      () =>
        mapChart(
          chartWith((h) => {
            if (h[3]) h[3].planet = [];
          }),
        ),
    ],
    ['unknown body', () => mapChart(chartWith((h) => h[0]?.planet.push('CHIRON')))],
    // planets
    [
      'planets missing Ketu',
      () =>
        mapPlanets(
          planetsSchema.parse(sample<Json[]>('planets').filter((p) => p['name'] !== 'Ketu')),
        ),
    ],
    [
      'duplicate planet',
      () =>
        mapPlanets(
          planetsSchema.parse([...sample<Json[]>('planets'), sample<Json[]>('planets')[0]]),
        ),
    ],
    [
      'sign contradicts longitude',
      () => mapPlanets(planetsSchema.parse(patchPlanet(0, { sign: 'Aries' }))),
    ],
    [
      'nakshatra pada 5',
      () => mapPlanets(planetsSchema.parse(patchPlanet(0, { nakshatra_pad: 5 }))),
    ],
    ['house 13', () => mapPlanets(planetsSchema.parse(patchPlanet(0, { house: 13 })))],
    [
      'longitude 360',
      () => mapPlanets(planetsSchema.parse(patchPlanet(0, { fullDegree: 360, sign: 'Aries' }))),
    ],
    [
      'degree in sign 30',
      () => mapPlanets(planetsSchema.parse(patchPlanet(0, { normDegree: 30 }))),
    ],
    // dasha
    [
      '8 dasha periods',
      () => mapMajorDasha(dashaSchema.parse(sample<Json[]>('major_vdasha').slice(1)), IST),
    ],
    [
      'gap between periods',
      () => {
        const raw = clone(sample<Json[]>('major_vdasha'));
        if (raw[1]) raw[1]['start'] = '3-5-2001 8:7';
        return mapMajorDasha(dashaSchema.parse(raw), IST);
      },
    ],
    [
      'period ending before it starts',
      () => {
        const raw = clone(sample<Json[]>('major_vdasha'));
        if (raw[8]) raw[8]['end'] = '1-1-2000 0:0';
        return mapMajorDasha(dashaSchema.parse(raw), IST);
      },
    ],
    [
      'repeated lord',
      () => {
        const raw = clone(sample<Json[]>('major_vdasha'));
        if (raw[1]) raw[1]['planet'] = 'Ketu';
        return mapMajorDasha(dashaSchema.parse(raw), IST);
      },
    ],
    [
      'antardashas not starting with the Mahadasha lord',
      () => mapSubDasha(dashaSchema.parse(sample('sub_vdasha')), IST, 'Venus'),
    ],
    // places, time, details, prediction
    [
      'timezone id "IST"',
      () =>
        mapGeoDetails({
          geonames: [
            { place_name: 'X', latitude: 1, longitude: 1, timezone_id: 'IST', country_code: 'IN' },
          ],
        }),
    ],
    [
      'latitude 95',
      () =>
        mapGeoDetails({
          geonames: [
            {
              place_name: 'X',
              latitude: 95,
              longitude: 1,
              timezone_id: 'Asia/Kolkata',
              country_code: 'IN',
            },
          ],
        }),
    ],
    ['timezone offset of 15 hours', () => mapTimezoneOffset({ timezone: 15 })],
    ['tropical-looking ayanamsa 0', () => mapBirthDetails({ ayanamsha: 0 })],
    [
      'unknown moon sign',
      () =>
        mapDailyPrediction(
          dailyNakshatraPredictionSchema.parse({
            ...sample<Json>('daily_nakshatra_prediction'),
            birth_moon_sign: 'Ophiuchus',
          }),
        ),
    ],
    ['prediction date 31 February', () => parsePredictionDate('31 February 2017')],
    ['prediction date with unknown month', () => parsePredictionDate('7 Julember 2017')],
  ])('%s', (_label, run) => {
    expect(run).toThrow(MappingError);
  });

  it('ignores Western outer planets if a chart includes them', () => {
    const chart = mapChart(chartWith((h) => h[0]?.planet.push('PLUTO')));
    expect(chart[0]?.bodies).toEqual([]);
  });
});

describe('parseDashaDate', () => {
  it.each([
    ['2-5-2021 8:7', 330, '2021-05-02T02:37:00Z'],
    ['31-12-1999 23:59', 0, '1999-12-31T23:59:00Z'],
    ['1-1-2000 0:30', 60, '1999-12-31T23:30:00Z'], // crosses the year backwards
    ['29-2-2024 12:0', -300, '2024-02-29T17:00:00Z'], // leap day, negative offset
  ])('%s at offset %i -> %s', (text, offset, expected) => {
    expect(parseDashaDate(text, offset)).toBe(expected);
  });

  it.each(['29-2-2023 1:1', '1-13-2020 1:1', '1-1-2020 24:0', '1-1-2020 1:60', '2021-05-02 8:7'])(
    'rejects %s',
    (text) => {
      expect(() => parseDashaDate(text, 0)).toThrow(MappingError);
    },
  );
});
