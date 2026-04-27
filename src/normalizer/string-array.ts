import {
  normalizeString,
} from './string.js';

/**
 * Normalizes a raw string array value.
 *
 * Trims each string element and filters out empty strings. Returns `undefined`
 * when the input is not an array or the normalized array is empty.
 *
 * @param value - Raw value to normalize.
 * @returns Array of trimmed strings, or `undefined` when the input is invalid.
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
