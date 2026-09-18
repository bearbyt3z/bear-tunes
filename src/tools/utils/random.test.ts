import { describe, expect, it } from 'vitest';

import {
  generateRandomHexString,
} from '#tools';

describe('generateRandomHexString', () => {
  it('generates a 40-character hexadecimal string by default', () => {
    const result = generateRandomHexString();

    expect(result).toHaveLength(40);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('generates a hexadecimal string with twice the requested byte length', () => {
    const result = generateRandomHexString(10);

    expect(result).toHaveLength(20);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('returns an empty string when the requested byte length is zero', () => {
    expect(generateRandomHexString(0)).toBe('');
  });

  it('typically generates different values across multiple calls', () => {
    const first = generateRandomHexString(20);
    const second = generateRandomHexString(20);

    // This assertion is probabilistic because independent random values may
    // theoretically collide, although the probability is negligible.
    expect(first).not.toBe(second);
  });

  it('throws a RangeError for a negative byte length', () => {
    expect(() => generateRandomHexString(-1)).toThrow(
      new RangeError('byteLength must be a non-negative integer.'),
    );
  });

  it('throws a RangeError for a non-integer byte length', () => {
    expect(() => generateRandomHexString(1.5)).toThrow(
      new RangeError('byteLength must be a non-negative integer.'),
    );
  });

  it('throws a RangeError for non-finite byte lengths', () => {
    expect(() => generateRandomHexString(Number.NaN)).toThrow(
      new RangeError('byteLength must be a non-negative integer.'),
    );
    expect(() => generateRandomHexString(Number.POSITIVE_INFINITY)).toThrow(
      new RangeError('byteLength must be a non-negative integer.'),
    );
    expect(() => generateRandomHexString(Number.NEGATIVE_INFINITY)).toThrow(
      new RangeError('byteLength must be a non-negative integer.'),
    );
  });
});
