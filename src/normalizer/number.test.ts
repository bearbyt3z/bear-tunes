import { describe, expect, it } from 'vitest';

import {
  normalizePositiveInteger,
  normalizePositiveNumber,
} from './number.js';

describe('normalizePositiveNumber', () => {
  it.each([
    { input: 42, expected: 42 },
    { input: '42', expected: 42 },
    { input: 42.5, expected: 42.5 },
    { input: '42.5', expected: 42.5 },
    { input: ' 42.5 ', expected: 42.5 },
    { input: '1e3', expected: 1000 },
  ])('normalizes "$input" to $expected', ({ input, expected }) => {
    expect(normalizePositiveNumber(input)).toBe(expected);
  });

  it.each([
    0,
    '0',
    -42,
    '-42',
    '',
    ' ',
    'not-a-number',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('returns undefined for an invalid number input (%j)', (value) => {
    expect(normalizePositiveNumber(value)).toBeUndefined();
  });

  it.each([
    null,
    undefined,
    true,
    {},
    [],
  ])('returns undefined for an unsupported input (%#)', (value) => {
    expect(normalizePositiveNumber(value)).toBeUndefined();
  });
});

describe('normalizePositiveInteger', () => {
  it.each([
    { input: 42, expected: 42 },
    { input: '42', expected: 42 },
    { input: ' 42 ', expected: 42 },
    { input: '1e3', expected: 1000 },
  ])('normalizes "$input" to $expected', ({ input, expected }) => {
    expect(normalizePositiveInteger(input)).toBe(expected);
  });

  it.each([
    0,
    '0',
    -42,
    '-42',
    42.5,
    '42.5',
    '',
    ' ',
    'not-a-number',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('returns undefined for an invalid integer input (%j)', (value) => {
    expect(normalizePositiveInteger(value)).toBeUndefined();
  });

  it.each([
    null,
    undefined,
    true,
    {},
    [],
  ])('returns undefined for an unsupported input (%#)', (value) => {
    expect(normalizePositiveInteger(value)).toBeUndefined();
  });
});
