/**
 * Converts a number to a string and prefixes it with `0` when it is a single digit.
 *
 * This is a local helper used internally by date and time formatting utilities.
 * It is intended for values such as month, day, minute, or second components.
 *
 * @internal
 * @param value - Number to format.
 * @returns A zero-padded string for values below `10`, otherwise the original number as a string.
 */
function zeroPad(value: number): string {
  return (value < 10) ? `0${value}` : value.toString();
}

/**
 * Formats a local date as an ISO 8601 calendar date string.
 *
 * The returned string uses the `YYYY-MM-DD` format based on the date's local
 * year, month, and day values.
 *
 * This helper uses local date getters (`getFullYear()`, `getMonth()`, and
 * `getDate()`), so the result is based on the local time zone rather than UTC.
 *
 * @param date - Date to format.
 * @returns A local date string in `YYYY-MM-DD` format.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getFullYear | MDN: Date.prototype.getFullYear()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getMonth | MDN: Date.prototype.getMonth()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getDate | MDN: Date.prototype.getDate()}
 * @see {@link https://www.iso.org/iso-8601-date-and-time-format.html | ISO 8601 date format}
 */
export function formatLocalDateToIsoDateString(date: Date): string {
  return `${date.getFullYear()}-${zeroPad(date.getMonth() + 1)}-${zeroPad(date.getDate())}`;
}

/**
 * Converts a duration in seconds to a human-readable time string.
 *
 * The result uses `m:ss` format for durations shorter than one hour and
 * `h:mm:ss` format when at least one full hour is present.
 *
 * The input is first rounded to the nearest whole second with `Math.round()`,
 * then split into hours, minutes, and seconds using integer division.
 *
 * Only non-negative finite numbers are accepted. A `TypeError` is thrown for
 * invalid input such as `NaN`, `Infinity`, or negative values.
 *
 * @example
 * ```ts
 * secondsToTimeFormat(73); // "1:13"
 * secondsToTimeFormat(253); // "4:13"
 * secondsToTimeFormat(3853); // "1:04:13"
 * ```
 *
 * @param inputSeconds - Duration in seconds.
 * @returns Formatted duration string.
 * @throws {TypeError} When `inputSeconds` is not a non-negative finite number.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite | MDN: Number.isFinite()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round | MDN: Math.round()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/floor | MDN: Math.floor()}
 */
export function secondsToTimeFormat(inputSeconds : number): string {
  if (!Number.isFinite(inputSeconds) || inputSeconds < 0) {
    throw new TypeError('inputSeconds must be a non-negative finite number.');
  }

  const totalSeconds = Math.round(inputSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  let result = '';
  if (hours > 0) {
    result += `${hours}:`;

    if (minutes < 10) {
      result += '0'; // Zero-pad minutes only when hours are present.
    }
  }

  result += `${minutes}:${zeroPad(seconds)}`;

  return result;
}

/**
 * Rounds a number to the specified number of decimal places.
 *
 * This helper scales the input by `10^decimalPlaces`, rounds the scaled value
 * with `Math.round()`, and then scales it back to the original magnitude.
 *
 * A small `Number.EPSILON` adjustment is applied before rounding to reduce
 * floating-point precision issues in edge cases such as `1.005`.
 *
 * This approach is based on a commonly used JavaScript rounding pattern
 * discussed in the following Stack Overflow thread and explanatory comment.
 *
 * @param num - Number to round.
 * @param decimalPlaces - Number of decimal places to keep. Defaults to `0`.
 * @returns The rounded number.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round | MDN: Math.round()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON | MDN: Number.EPSILON}
 * @see {@link https://stackoverflow.com/questions/11832914/how-to-round-to-at-most-2-decimal-places-if-necessary/48764436#48764436 | Stack Overflow: explanation of the EPSILON-based rounding method}
 */
export function roundToDecimalPlaces(num: number, decimalPlaces: number = 0): number {
  const p = Math.pow(10, decimalPlaces);
  const n = (num * p) * (1 + Number.EPSILON);
  return Math.round(n) / p;
}

/**
 * Returns the first line of a string.
 *
 * This helper splits the input on the first Unix (`\n`) or Windows (`\r\n`)
 * line break and returns only the text before it.
 *
 * It is useful for shortening multi-line messages, for example when logging
 * only the first line of an error and omitting the remaining stack trace.
 *
 * @param text - Text from which to extract the first line.
 * @returns The first line of the input string, or the whole string if it does not contain a line break.
 */
export function getFirstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0];
}
