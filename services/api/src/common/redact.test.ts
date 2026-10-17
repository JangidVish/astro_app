import { describe, expect, it } from 'vitest';
import { REDACTED, redact, redactUrl } from './redact.js';
import { sha256Hex, uidHash } from './hashing.js';

describe('redact', () => {
  it('redacts birth data and credentials at any depth, case-insensitively', () => {
    const input = {
      profile: {
        Name: 'Asha',
        birthDate: { year: 1990, month: 5, day: 10 },
        birthTime: { hour: 19, minute: 55 },
        place: { lat: 19.07, lon: 72.88 },
      },
      headers: { Authorization: 'Bearer abc', 'X-Firebase-AppCheck': 'xyz' },
      providerBody: {
        day: 10,
        month: 5,
        year: 1990,
        hour: 19,
        min: 55,
        lat: 1,
        lon: 2,
        tzone: 5.5,
      },
      status: 502,
    };
    const out = redact(input) as Record<string, Record<string, unknown>>;
    expect(out['profile']).toEqual({
      Name: REDACTED,
      birthDate: REDACTED,
      birthTime: REDACTED,
      place: REDACTED,
    });
    expect(out['headers']).toEqual({ Authorization: REDACTED, 'X-Firebase-AppCheck': REDACTED });
    expect(Object.values(out['providerBody'] ?? {})).toEqual(Array(8).fill(REDACTED));
    expect(out['status']).toBe(502);
  });

  it('walks arrays', () => {
    expect(redact([{ email: 'a@b.c', ok: 1 }])).toEqual([{ email: REDACTED, ok: 1 }]);
  });

  it('does not mutate its input', () => {
    const input = { token: 'abc' };
    redact(input);
    expect(input.token).toBe('abc');
  });

  it('handles circular references', () => {
    const a: Record<string, unknown> = { id: 1 };
    a['self'] = a;
    expect(redact(a)).toEqual({ id: 1, self: '[Circular]' });
  });

  it('truncates very deep objects', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(JSON.stringify(redact(deep))).toContain('[Truncated]');
  });

  it('keeps error type and message but redacts sensitive error properties and causes', () => {
    const cause = Object.assign(new Error('provider said no'), { body: { lat: 19.07 } });
    const error = Object.assign(new Error('chart failed', { cause }), {
      request: { birthDate: '1990-05-10' },
    });
    const out = redact(error) as Record<string, unknown>;
    expect(out['type']).toBe('Error');
    expect(out['message']).toBe('chart failed');
    expect(out['request']).toEqual({ birthDate: REDACTED });
    expect(JSON.stringify(out)).not.toContain('19.07');
    expect(JSON.stringify(out)).not.toContain('1990-05-10');
  });

  it('passes primitives through unchanged', () => {
    expect(redact('text')).toBe('text');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});

describe('redactUrl', () => {
  it('drops query strings (place searches, dates)', () => {
    expect(redactUrl('/v1/places?q=mumbai')).toBe(`/v1/places?${REDACTED}`);
    expect(redactUrl('/v1/profiles/p1/chart')).toBe('/v1/profiles/p1/chart');
  });
});

describe('hashing', () => {
  const pepperA = Buffer.alloc(32, 1);
  const pepperB = Buffer.alloc(32, 2);

  it('uidHash is deterministic, pepper-dependent, and does not reveal the uid', () => {
    expect(uidHash('user-1', pepperA)).toBe(uidHash('user-1', pepperA));
    expect(uidHash('user-1', pepperA)).not.toBe(uidHash('user-1', pepperB));
    expect(uidHash('user-1', pepperA)).not.toBe(uidHash('user-2', pepperA));
    expect(uidHash('user-1', pepperA)).not.toContain('user-1');
    expect(uidHash('user-1', pepperA)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('sha256Hex matches a known vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
