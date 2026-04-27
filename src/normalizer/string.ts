/**
 * Normalizes a raw string value.
 *
 * Trims whitespace and returns `undefined` for empty strings after trimming.
 *
 * @param value - Raw value to normalize.
 * @returns Trimmed string, or `undefined` when the input is invalid.
 */
export function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}
