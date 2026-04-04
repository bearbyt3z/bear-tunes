/**
 * Attempts to parse a value into a positive integer.
 *
 * Returns `undefined` when the input is missing, non-numeric, zero, or negative.
 *
 * @param value - Value to parse as positive integer.
 * @returns A parsed positive integer, or `undefined` when the input is invalid.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number | MDN: Number constructor}
 */
export function tryParsePositiveInteger(value: string | number | undefined): number | undefined {
  const result = Number(value);
  return (Number.isInteger(result) && result > 0) ? result : undefined;
}

/**
 * Attempts to parse a string into a {@link URL} object.
 *
 * Returns `undefined` when the input is missing or cannot be parsed as a valid URL.
 * Unlike calling `new URL()` directly, this helper does not throw for malformed input.
 *
 * @param str - URL string to parse.
 * @returns A parsed {@link URL} instance, or `undefined` when the input is empty or invalid.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URL/URL | MDN: URL() constructor}
 */
export function tryParseUrl(str?: string): URL | undefined {
  if (!str) return undefined;

  try {
    return new URL(str);
  } catch {
    return undefined;
  }
}
