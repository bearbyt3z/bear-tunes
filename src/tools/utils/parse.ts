/**
 * Attempts to parse a value into a positive integer.
 *
 * Returns `undefined` when the input is missing, non-numeric, non-integer,
 * zero, negative, or not finite.
 *
 * @param value - Value to parse as a positive integer.
 * @returns A parsed positive integer, or `undefined` when the input is invalid.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number | MDN: Number constructor}
 */
export function tryParsePositiveInteger(value: string | number | undefined): number | undefined {
  const result = tryParsePositiveNumber(value);
  return Number.isInteger(result) ? result : undefined;
}

/**
 * Attempts to parse a value into a positive number.
 *
 * Returns undefined when the input is missing, non-numeric, zero, negative, or not finite.
 *
 * @param value - Value to parse as a positive number.
 * @returns A parsed positive number, or undefined when the input is invalid.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number Number constructor}
 */
export function tryParsePositiveNumber(value: string | number | undefined): number | undefined {
  const result = Number(value);
  return (Number.isFinite(result) && result > 0) ? result : undefined;
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
