// Real AstrologyAPI responses captured by scripts/provider-spike.ts (T3.4) for a synthetic
// profile: 1990-05-10 19:55 at Mumbai (19.076, 72.8777), tzone +5.5, and the same instant sent
// as 14:25 at tzone 0. These pin our schemas and mappers to what the live API actually returns.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRAHAS } from '@astro/shared';
import {
  mapBirthDetails,
  mapChart,
  mapDailyPrediction,
  mapGeoDetails,
  mapMajorDasha,
  mapPlanets,
  mapSubDasha,
  mapTimezoneOffset,
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

const DIR = new URL('../../../../test/fixtures/provider/astrologyapi/live/', import.meta.url);
const live = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8')) as unknown;
const BIRTH_UTC_MS = Date.UTC(1990, 4, 10, 14, 25);

describe('live AstrologyAPI responses (captured 2026-10-17)', () => {
  it('geo_details', () => {
    expect(mapGeoDetails(geoDetailsSchema.parse(live('geo_details')))[0]).toMatchObject({
      name: 'Mumbai',
      timezoneId: 'Asia/Kolkata',
    });
  });

  it('birth_details: Lahiri ayanamsa (about 23.72 deg in 1990)', () => {
    const { ayanamsa } = mapBirthDetails(birthDetailsSchema.parse(live('birth_details')));
    expect(ayanamsa).toBeCloseTo(23.72, 1);
  });

  it('planets: same longitudes whether the instant is sent at tzone 5.5 or 0', () => {
    const local = mapPlanets(planetsSchema.parse(live('planets')));
    const utc = mapPlanets(planetsSchema.parse(live('planets_same_instant_utc')));
    expect(local).toHaveLength(10);
    expect(local).toEqual(utc);
  });

  it.each(['horo_chart_D1', 'horo_chart_D9'])('%s: 12 houses, every graha once', (name) => {
    const chart = mapChart(horoChartSchema.parse(live(name)));
    expect(chart).toHaveLength(12);
    expect(chart.flatMap((h) => h.bodies).sort()).toEqual([...GRAHAS].sort());
  });

  it('D1 chart agrees with the planet table', () => {
    const chart = mapChart(horoChartSchema.parse(live('horo_chart_D1')));
    const planets = mapPlanets(planetsSchema.parse(live('planets')));
    for (const graha of GRAHAS) {
      expect(chart.find((h) => h.bodies.includes(graha))?.house, graha).toBe(
        planets.find((p) => p.body === graha)?.house,
      );
    }
  });

  it('major_vdasha: double-space dates parse; tzone-local strings map to the same UTC instants', () => {
    const local = mapMajorDasha(dashaSchema.parse(live('major_vdasha')), 330);
    const utc = mapMajorDasha(dashaSchema.parse(live('major_vdasha_same_instant_utc')), 0);
    expect(local).toEqual(utc);
    // The birth falls inside the first (partly elapsed) Mahadasha.
    const first = local[0];
    expect(Date.parse(first?.start ?? '')).toBeLessThan(BIRTH_UTC_MS);
    expect(Date.parse(first?.end ?? '')).toBeGreaterThan(BIRTH_UTC_MS);
  });

  it('daily predictions: today, previous and next are consecutive dates', () => {
    const date = (name: string) =>
      mapDailyPrediction(dailyNakshatraPredictionSchema.parse(live(name))).forDate;
    const today = Date.parse(date('daily_nakshatra_prediction_today'));
    expect(Date.parse(date('daily_nakshatra_prediction_previous'))).toBe(today - 86_400_000);
    expect(Date.parse(date('daily_nakshatra_prediction_next'))).toBe(today + 86_400_000);
  });

  it('timezone_with_dst responses map to whole minutes', () => {
    expect(
      mapTimezoneOffset(timezoneWithDstSchema.parse(live('timezone_with_dst_nepal-modern'))),
    ).toBe(345);
    expect(
      mapTimezoneOffset(timezoneWithDstSchema.parse(live('timezone_with_dst_ist-war-1943'))),
    ).toBe(390);
  });

  it.runIf(existsSync(new URL('sub_vdasha_ketu.json', DIR)))(
    'sub_vdasha: antardashas start with the Mahadasha lord',
    () => {
      const periods = mapSubDasha(dashaSchema.parse(live('sub_vdasha_ketu')), 330, 'Ketu');
      expect(periods[0]?.lord).toBe('Ketu');
    },
  );
});
