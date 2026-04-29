/**
 * Normalizes a value into a canonical `Date` instance.
 *
 * Parses a string into a valid `Date` instance, or returns an existing valid
 * `Date` instance unchanged. Returns `undefined` when the input is not a
 * string, not a `Date`, or cannot be parsed into a valid date.
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
