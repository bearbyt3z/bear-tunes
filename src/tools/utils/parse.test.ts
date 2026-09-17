import { describe, expect, it } from 'vitest';
import {
  tryParsePositiveInteger,
  tryParsePositiveNumber,
  tryParseUrl,
} from '#tools';

describe('tryParsePositiveInteger', () => {
  it('returns a positive integer from a number', () => {
    expect(tryParsePositiveInteger(42)).toBe(42);
  });

  it('returns a positive integer from a numeric string', () => {
    expect(tryParsePositiveInteger('42')).toBe(42);
  });

  it('returns undefined for zero', () => {
    expect(tryParsePositiveInteger(0)).toBeUndefined();
  });

  it('returns undefined for negative values', () => {
    expect(tryParsePositiveInteger(-42)).toBeUndefined();
  });

  it('returns undefined for non-integer values', () => {
    expect(tryParsePositiveInteger(42.5)).toBeUndefined();
    expect(tryParsePositiveInteger('42.5')).toBeUndefined();
  });

  it('returns undefined for non-numeric, non-finite, and missing values', () => {
    expect(tryParsePositiveInteger('not-a-number')).toBeUndefined();
    expect(tryParsePositiveInteger(NaN)).toBeUndefined();
    expect(tryParsePositiveInteger(Infinity)).toBeUndefined();
    expect(tryParsePositiveInteger(undefined)).toBeUndefined();
  });
});

describe('tryParsePositiveNumber', () => {
  it('returns a positive number from a number', () => {
    expect(tryParsePositiveNumber(42.5)).toBe(42.5);
  });

  it('returns a positive number from a numeric string', () => {
    expect(tryParsePositiveNumber('42.5')).toBe(42.5);
  });

  it('accepts integer values as positive numbers', () => {
    expect(tryParsePositiveNumber(42)).toBe(42);
  });

  it('returns undefined for zero', () => {
    expect(tryParsePositiveNumber(0)).toBeUndefined();
    expect(tryParsePositiveNumber('0')).toBeUndefined();
  });

  it('returns undefined for negative values', () => {
    expect(tryParsePositiveNumber(-42.5)).toBeUndefined();
    expect(tryParsePositiveNumber('-42.5')).toBeUndefined();
  });

  it('returns undefined for non-numeric, non-finite, and missing values', () => {
    expect(tryParsePositiveNumber('not-a-number')).toBeUndefined();
    expect(tryParsePositiveNumber(NaN)).toBeUndefined();
    expect(tryParsePositiveNumber(Infinity)).toBeUndefined();
    expect(tryParsePositiveNumber(undefined)).toBeUndefined();
  });
});

describe('tryParseUrl', () => {
  it('returns a URL instance for a valid URL', () => {
    const result = tryParseUrl('https://example.com/track');

    expect(result).toBeInstanceOf(URL);
    expect(result?.href).toBe('https://example.com/track');
  });

  it('returns undefined for an empty string', () => {
    expect(tryParseUrl('')).toBeUndefined();
  });

  it('returns undefined for a missing value', () => {
    expect(tryParseUrl()).toBeUndefined();
  });

  it('returns undefined for an invalid URL', () => {
    expect(tryParseUrl('not-a-url')).toBeUndefined();
  });

  it('returns undefined for a relative URL', () => {
    expect(tryParseUrl('/track')).toBeUndefined();
  });
});
