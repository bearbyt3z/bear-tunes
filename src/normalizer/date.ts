/**
 * Normalizes a value into a canonical `Date` instance.
 *
 * Parses strings using the native JavaScript `Date` parser, preserving its
 * interpretation of supported date formats. A year-only string, such as
 * `"2024"`, represents January 1 of that year. Existing valid `Date`
 * instances are returned unchanged.
 *
 * Returns `undefined` when the input is not a string or a `Date`, or cannot
 * be parsed into a valid date.
 *
 * @param value - Value to normalize.
 * @returns Canonical `Date` instance, or `undefined` when the input is invalid.
 */
export function normalizeDate(value: unknown): Date | undefined {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } else if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  return undefined;
}
