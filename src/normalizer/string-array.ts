import { normalizeString } from './string.js';

/**
 * Normalizes a value into a canonical string array.
 *
 * Trims each string, removes non-string values and strings that are empty
 * after trimming, and preserves the order and duplicates of valid strings.
 * Returns `undefined` when the input is not an array or no valid strings
 * remain after normalization.
 *
 * @param value - Value to normalize.
 * @returns Array of trimmed strings, or `undefined` when no valid strings remain.
 */
export function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map(normalizeString)
    .filter((item): item is string => item !== undefined);

  return normalized.length > 0 ? normalized : undefined;
}
