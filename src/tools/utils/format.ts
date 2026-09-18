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
 * Formats a valid local date as an ISO 8601 calendar date string.
 *
 * The returned string uses the `YYYY-MM-DD` format based on the date's local
 * year, month, and day values.
 *
 * This helper uses local date getters (`getFullYear()`, `getMonth()`, and
 * `getDate()`), so the result is based on the local time zone rather than UTC.
 *
 * @param date - Valid Date to format.
 * @returns A local date string in `YYYY-MM-DD` format.
 * @throws {TypeError} If the date is invalid.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getFullYear | MDN: Date.prototype.getFullYear()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getMonth | MDN: Date.prototype.getMonth()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getDate | MDN: Date.prototype.getDate()}
 * @see {@link https://www.iso.org/iso-8601-date-and-time-format.html | ISO 8601 date format}
 */
export function formatLocalDateToIsoDateString(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('date must be a valid Date.');
  }

  const year = date.getFullYear().toString().padStart(4, '0');

  return `${year}-${zeroPad(date.getMonth() + 1)}-${zeroPad(date.getDate())}`;
}

/**
 * Formats one command-line argument for human-readable diagnostic output.
 *
 * Values containing whitespace, quotation marks, or backslashes are JSON
 * serialized so that their boundaries and special characters are visible.
 * The returned value is for display only and is not shell-escaped.
 *
 * @param argument - Command-line argument to format.
 * @returns Readable display representation of the argument.
 */
export function formatCommandArgumentForLogging(argument: string): string {
  return /[\s"'\\]/u.test(argument)
    ? JSON.stringify(argument)
    : argument;
}

/**
 * Formats command-line arguments for human-readable diagnostic output.
 *
 * Each argument is formatted independently, then the resulting values are
 * joined with spaces. The returned string is for logging only and must not be
 * used as a shell command.
 *
 * @param args - Command-line arguments to format.
 * @returns A space-separated diagnostic representation of the arguments.
 */
export function formatCommandArgumentsForLogging(
  args: readonly string[],
): string {
  return args.map(formatCommandArgumentForLogging).join(' ');
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
 * Rounds a finite number to the specified number of decimal places.
 *
 * The input is rounded using decimal-place scaling and `Math.round()`.
 * Values are rounded symmetrically for positive and negative numbers, and
 * floating-point precision issues are reduced for common decimal edge cases.
 *
 * `decimalPlaces` must be a non-negative integer. A `RangeError` is thrown when
 * `decimalPlaces` is negative, non-integer, or too large to be represented by
 * the decimal scaling factor.
 *
 * If decimal scaling would overflow the finite number range, the original input
 * value is returned unchanged.
 *
 * @param num - Finite number to round.
 * @param decimalPlaces - Number of decimal places to keep. Defaults to `0`.
 * @returns The rounded number, or the original input value when decimal scaling would overflow.
 * @throws {TypeError} If `num` is not a finite number.
 * @throws {RangeError} If `decimalPlaces` is not a non-negative integer or is too large.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round | MDN: Math.round()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite | MDN: Number.isFinite()}
 */
export function roundToDecimalPlaces(num: number, decimalPlaces = 0): number {
  if (!Number.isFinite(num)) {
    throw new TypeError('num must be a finite number.');
  }

  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new RangeError('decimalPlaces must be a non-negative integer.');
  }

  const decimalScale = 10 ** decimalPlaces;

  if (!Number.isFinite(decimalScale)) {
    throw new RangeError('decimalPlaces is too large.');
  }

  const magnitude = Math.abs(num) * decimalScale;

  if (!Number.isFinite(magnitude)) {
    return num;
  }

  const adjustedMagnitude = magnitude * (1 + Number.EPSILON);

  if (!Number.isFinite(adjustedMagnitude)) {
    return num;
  }

  const rounded = Math.round(adjustedMagnitude) / decimalScale;

  return Math.sign(num) * rounded;
}

/**
 * Returns the first line of a string.
 *
 * This helper splits the input on the first common line break (`\n`, `\r\n`,
 * or `\r`) and returns only the text before it.
 *
 * It is useful for shortening multi-line messages, for example when logging
 * only the first line of an error and omitting the remaining stack trace.
 *
 * @param text - Text from which to extract the first line.
 * @returns The first line of the input string, or the whole string if it does not contain a line break.
 */
export function getFirstLine(text: string): string {
  return text.split(/\r\n|\r|\n/, 1)[0];
}

/**
 * Converts a string into a URL-friendly slug.
 *
 * The resulting slug contains only lowercase ASCII letters, digits, and
 * hyphens, making it safe to use as a single URL path segment.
 *
 * The input is normalized using Unicode NFD normalization, combining
 * diacritical marks are removed, and unsupported characters are discarded.
 * Whitespace is converted to hyphens, consecutive hyphens are collapsed,
 * and leading or trailing hyphens are removed.
 *
 * This helper is intended for generating readable identifiers for resources,
 * such as URL path segments or file names.
 *
 * @example
 * ```ts
 * slugify('Hello World'); // "hello-world"
 * slugify('Zażółć gęślą jaźń'); // "zazoc-gesla-jazn"
 * slugify('Førehand'); // "frehand"
 * slugify('  Foo --- Bar!  '); // "foo-bar"
 * slugify('foo/bar'); // "foobar"
 * ```
 *
 * @param text - Text to convert into a slug.
 * @returns A lowercase ASCII slug containing only letters, digits, and hyphens.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize | MDN: String.prototype.normalize()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replaceAll | MDN: String.prototype.replaceAll()}
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD') // Decompose accented characters into base characters and combining marks.
    .replaceAll(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks, e.g. "ą" -> "a".
    .toLowerCase() // Convert the entire string to lowercase.
    .trim() // Remove leading and trailing whitespace.
    .replaceAll(/[^a-z0-9\s-]/g, '') // Keep only ASCII letters, digits, spaces, and hyphens.
    .replaceAll(/\s+/g, '-') // Replace one or more spaces with a single hyphen.
    .replaceAll(/-+/g, '-') // Collapse consecutive hyphens into a single hyphen.
    .replaceAll(/^-+|-+$/g, ''); // Remove hyphens from the beginning and the end of the slug.
}
