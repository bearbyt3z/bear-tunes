import {
  normalizeString,
} from './string.js';

/**
 * Normalizes a value into a canonical string array.
 *
 * Accepts an array value, normalizes each element as a string, and removes empty
 * entries. Returns `undefined` when the input is not an array or when the
 * normalized array is empty.
 *
 * @param value - Value to normalize.
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
