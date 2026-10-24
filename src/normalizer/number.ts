import {
  tryParsePositiveInteger,
  tryParsePositiveNumber,
} from '#tools';

/**
 * Normalizes a value into a canonical positive number.
 *
 * Converts a string or number using the shared numeric parser. Returns
 * `undefined` when the input is not a string or number, or when the result
 * is non-finite, zero, or negative.
 *
 * @param value - Value to normalize.
 * @returns Positive finite number, or `undefined` when the input is invalid.
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
 * Converts a string or number using the shared numeric parser and accepts
 * only positive integer results. Returns `undefined` when the input is
 * unsupported, non-finite, zero, negative, or not an integer.
 *
 * @param value - Value to normalize.
 * @returns Positive integer, or `undefined` when the input is invalid.
 */
export function normalizePositiveInteger(value: unknown): number | undefined {
  const numberResult = normalizePositiveNumber(value);

  return tryParsePositiveInteger(numberResult);
}
