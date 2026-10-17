import type { ChartBody, ChartHouse, PlanetPosition } from '@astro/shared';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface HouseCell {
  readonly house: number;
  readonly signNumber: number;
  /** Polygon corners, for hit areas and tests. */
  readonly polygon: readonly Point[];
  /** Where graha labels are centred. */
  readonly labelAt: Point;
  /** Where the small sign number sits, near the cell's inner corner. */
  readonly signAt: Point;
  /** Graha labels, e.g. "Sa℞", one per body. */
  readonly labels: readonly string[];
}

export const ABBREVIATIONS: Record<ChartBody, string> = {
  Ascendant: 'As',
  Sun: 'Su',
  Moon: 'Mo',
  Mars: 'Ma',
  Mercury: 'Me',
  Jupiter: 'Ju',
  Venus: 'Ve',
  Saturn: 'Sa',
  Rahu: 'Ra',
  Ketu: 'Ke',
};

/** Retrograde mark (U+211E). Rahu and Ketu always move backwards, so it is not shown for them. */
const RETRO = '℞';

function centroid(points: readonly Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Moves `from` a fraction of the way towards `to`. */
function towards(from: Point, to: Point, fraction: number): Point {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

/**
 * Geometry of a North Indian (diamond) chart in a square of side `size`. House 1 is the top
 * diamond; houses then run counter-clockwise: 4 is the left diamond, 7 the bottom, 10 the right.
 */
export function northIndianCells(size: number): { house: number; polygon: Point[] }[] {
  const s = size;
  const TL = { x: 0, y: 0 };
  const TR = { x: s, y: 0 };
  const BR = { x: s, y: s };
  const BL = { x: 0, y: s };
  const T = { x: s / 2, y: 0 };
  const R = { x: s, y: s / 2 };
  const B = { x: s / 2, y: s };
  const L = { x: 0, y: s / 2 };
  const M = { x: s / 2, y: s / 2 };
  // Where the diagonals cross the inner diamond.
  const q1 = { x: s / 4, y: s / 4 };
  const q2 = { x: (3 * s) / 4, y: s / 4 };
  const q3 = { x: (3 * s) / 4, y: (3 * s) / 4 };
  const q4 = { x: s / 4, y: (3 * s) / 4 };
  return [
    { house: 1, polygon: [T, q2, M, q1] },
    { house: 2, polygon: [TL, T, q1] },
    { house: 3, polygon: [TL, q1, L] },
    { house: 4, polygon: [L, q1, M, q4] },
    { house: 5, polygon: [L, q4, BL] },
    { house: 6, polygon: [BL, q4, B] },
    { house: 7, polygon: [B, q4, M, q3] },
    { house: 8, polygon: [B, q3, BR] },
    { house: 9, polygon: [BR, q3, R] },
    { house: 10, polygon: [R, q3, M, q2] },
    { house: 11, polygon: [R, q2, TR] },
    { house: 12, polygon: [TR, q2, T] },
  ];
}

/**
 * Full layout: geometry plus the sign and grahas of each house. The Ascendant is marked in house 1
 * ("As"); a graha is marked retrograde (℞) when the planet table says so.
 */
export function northIndianLayout(
  houses: readonly ChartHouse[],
  planets: readonly PlanetPosition[],
  size: number,
): HouseCell[] {
  const retro = new Set(planets.filter((p) => p.isRetrograde).map((p) => p.body));
  const center = { x: size / 2, y: size / 2 };
  return northIndianCells(size).map(({ house, polygon }) => {
    const data = houses.find((h) => h.house === house);
    if (!data) throw new Error(`chart is missing house ${String(house)}`);
    const bodies: ChartBody[] = house === 1 ? ['Ascendant', ...data.bodies] : [...data.bodies];
    const labelAt = centroid(polygon);
    return {
      house,
      signNumber: data.signNumber,
      polygon,
      labelAt,
      // Sign number sits between the label and the chart centre (the cell's inner corner).
      signAt: towards(labelAt, center, 0.55),
      labels: bodies.map((b) => {
        const nodes = b === 'Rahu' || b === 'Ketu';
        return `${ABBREVIATIONS[b]}${retro.has(b) && !nodes ? RETRO : ''}`;
      }),
    };
  });
}

/** Splits labels into lines so crowded houses stay inside their cell. */
export function wrapLabels(labels: readonly string[], perLine: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < labels.length; i += perLine)
    lines.push(labels.slice(i, i + perLine).join(' '));
  return lines;
}

/** Short spoken summary for screen readers, e.g. "House 1, Libra: Ascendant. House 7, Aries: Moon." */
export function describeChart(houses: readonly ChartHouse[]): string {
  return houses
    .map((h) => {
      const bodies = h.house === 1 ? ['Ascendant', ...h.bodies] : h.bodies;
      return `House ${String(h.house)}, ${h.sign}${bodies.length ? `: ${bodies.join(', ')}` : ''}`;
    })
    .join('. ');
}
