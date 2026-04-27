import {
  tryParsePositiveInteger,
  tryParsePositiveNumber,
} from '#tools';

/**
 * Normalizes a raw positive numeric value.
 *
 * Parses a string or number into a positive number and returns `undefined`
 * when the input is not a string, not a number, or cannot be parsed as a
 * positive finite number.
 *
 * @param value - Raw value to normalize.
 * @returns Parsed positive number, or `undefined` when the input is invalid.
 */
export function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  return tryParsePositiveNumber(value);
}

/**
 * Normalizes a raw positive integer value.
 *
 * Parses a string or number into a positive integer and returns `undefined`
 * when the input is not a string, not a number, or cannot be parsed as a
 * positive finite integer.
 *
 * @param value - Raw value to normalize.
 * @returns Parsed positive integer, or `undefined` when the input is invalid.
 */
export function normalizePositiveInteger(value: unknown): number | undefined {
  const numberResult = normalizePositiveNumber(value);
  return tryParsePositiveInteger(numberResult);
}
