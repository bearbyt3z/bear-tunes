import {
  tryParseUrl,
} from '#tools';

/**
 * Normalizes a value into a canonical `URL` instance.
 *
 * Parses a string into a valid \URL` instance, or returns an existing valid
 * `URL` instance unchanged. Returns `undefined` when the input is invalid.
 *
 * @param value - Value to normalize.
 * @returns Canonical `URL` instance, or `undefined` when the input is invalid.
 */
export function normalizeUrl(value: unknown): URL | undefined {
  if (value instanceof URL) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  return tryParseUrl(value);
}
