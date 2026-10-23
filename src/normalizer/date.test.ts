import { describe, expect, it } from 'vitest';

import { normalizeDate } from './date.js';

describe('normalizeDate', () => {
  it.each([
    {
      input: '2024',
      expected: '2024-01-01T00:00:00.000Z',
    },
    {
      input: '2024-05',
      expected: '2024-05-01T00:00:00.000Z',
    },
    {
      input: '2024-05-17',
      expected: '2024-05-17T00:00:00.000Z',
    },
    {
      input: '2024-05-17T10:15:30.000Z',
      expected: '2024-05-17T10:15:30.000Z',
    },
  ])('normalizes "$input"', ({ input, expected }) => {
    expect(normalizeDate(input)?.toISOString()).toBe(expected);
  });

  it('returns an existing valid Date instance unchanged', () => {
    const date = new Date('2024-05-17T12:30:00.000Z');

    expect(normalizeDate(date)).toBe(date);
  });

  it('returns undefined for an invalid Date instance', () => {
    expect(normalizeDate(new Date(Number.NaN))).toBeUndefined();
  });

  it('returns undefined for an unparseable string', () => {
    expect(normalizeDate('not-a-date')).toBeUndefined();
  });

  it.each([
    null,
    2024,
    true,
    {},
    [],
    undefined,
  ])('returns undefined for an unsupported input (%#)', (value) => {
    expect(normalizeDate(value)).toBeUndefined();
  });
});
