import { describe, expect, it } from 'vitest';

import { normalizeStringArray } from './string-array.js';

describe('normalizeStringArray', () => {
  it('trims strings and removes empty or unsupported entries', () => {
    expect(
      normalizeStringArray([
        ' Artist One ',
        '',
        '  ',
        null,
        123,
        undefined,
        ' Artist Two ',
      ]),
    ).toEqual(['Artist One', 'Artist Two']);
  });

  it('preserves the order and duplicates of valid strings', () => {
    expect(
      normalizeStringArray([
        ' Artist ',
        'Title',
        'Artist',
        ' Title ',
      ]),
    ).toEqual(['Artist', 'Title', 'Artist', 'Title']);
  });

  it('returns undefined for an empty array', () => {
    expect(normalizeStringArray([])).toBeUndefined();
  });

  it('returns undefined when no valid strings remain', () => {
    expect(
      normalizeStringArray([
        '',
        '  ',
        null,
        undefined,
        123,
        true,
        {},
        [],
      ]),
    ).toBeUndefined();
  });

  it.each([
    null,
    undefined,
    'Artist',
    123,
    true,
    {},
  ])('returns undefined for a non-array input (%#)', (value) => {
    expect(normalizeStringArray(value)).toBeUndefined();
  });

  it('returns a new array containing normalized strings', () => {
    const input = [' Artist One ', ' Artist Two '];

    const result = normalizeStringArray(input);

    expect(result).toEqual(['Artist One', 'Artist Two']);
    expect(result).not.toBe(input);
    expect(input).toEqual([' Artist One ', ' Artist Two ']);
  });
});
