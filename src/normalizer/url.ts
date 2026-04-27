import {
  tryParseUrl,
} from '#tools';

/**
 * Normalizes a raw URL value into a parsed URL instance.
 *
 * @param value - Raw URL value to normalize.
 * @returns Parsed URL instance, or `undefined` when the input is invalid.
 */
export function normalizeUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return tryParseUrl(value);
}
