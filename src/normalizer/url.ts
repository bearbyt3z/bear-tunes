import {
  tryParseUrl,
} from '#tools';

/**
 * Normalizes a raw or already normalized URL value into a canonical `URL` instance.
 *
 * @param value - Raw or already normalized URL value to normalize.
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
