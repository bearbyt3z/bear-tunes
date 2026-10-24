import {
  tryParseUrl,
} from '#tools';

/**
 * Normalizes a value into a canonical `URL` instance.
 *
 * Parses an absolute URL string using the shared URL parser, or returns an
 * existing `URL` instance unchanged. Relative URLs are not accepted because
 * no base URL is provided. Returns `undefined` for unsupported input types
 * or strings that cannot be parsed into a valid URL.
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
