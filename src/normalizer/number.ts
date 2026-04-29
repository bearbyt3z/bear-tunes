import {
  tryParsePositiveInteger,
  tryParsePositiveNumber,
} from '#tools';

/**
 * Normalizes a value into a canonical positive number.
 *
 * Parses a string or number into a positive number. Returns `undefined`
 * when the input is not a string, not a number, or cannot be parsed as a
 * positive finite number.
 *
 * @param value - Value to normalize.
 * @param value - Raw or already normalized value to normalize.
 */
export function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  return tryParsePositiveNumber(value);
}

/**
 * Normalizes a value into a canonical positive integer.
 *
 * Parses a string or number into a positive integer. Returns `undefined`
 * when the input is not a string, not a number, or cannot be parsed as a
 * positive finite integer.
 *
 * @param value - Value to normalize.
 * @returns Parsed positive integer, or `undefined` when the input is invalid.
 */
export function normalizePositiveInteger(value: unknown): number | undefined {
  const numberResult = normalizePositiveNumber(value);
  return tryParsePositiveInteger(numberResult);
}
