const colonEscapeChar = '\\'; // same on windows & linux platform

/**
 * Escapes unescaped colon characters by prefixing them with the colon escape
 * character.
 *
 * This helper is idempotent: it only escapes `:` characters that are not
 * already preceded by `\`, so repeated calls do not keep adding extra
 * backslashes.
 *
 * The escape character is defined as a dedicated constant to make its purpose
 * explicit and avoid relying on an inline escaped string literal.
 *
 * `replaceAll()` is used with a regular expression because the helper needs a
 * negative lookbehind assertion (`(?<!\\)`) to skip already escaped colons.
 * When `replaceAll()` receives a `RegExp`, the pattern must use the global
 * (`g`) flag; otherwise JavaScript throws a `TypeError`.
 *
 * @param str - String in which unescaped colon characters should be escaped.
 * @returns A new string with every unescaped `:` replaced with `\:`.
 */
export function escapeUnescapedColons(str: string): string {
  return str.replaceAll(/(?<!\\):/g, `${colonEscapeChar}:`);
}

/**
 * Returns a string with its first character converted to uppercase.
 *
 * Returns the original value unchanged when the input is an empty string.
 *
 * @param str - String to capitalize.
 * @returns A new string with the first character converted to uppercase.
 */
export function capitalize(str: string): string {
  if (!str) return str;

  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Escapes regular expression special characters in a string.
 *
 * This helper is intended for building regular expressions from literal text
 * while preserving a readable backslash-based escaped form.
 *
 * It prefixes each matched special character with `\` by using
 * `String.prototype.replace()` and the `$&` replacement pattern, where `$&`
 * inserts the entire matched substring.
 *
 * Unlike `RegExp.escape()`, this helper keeps the output in the classic
 * backslash-escaped form instead of using escape sequences such as `\xNN`.
 *
 * @param str - String whose regular expression special characters should be escaped.
 * @returns A new string with RegExp special characters escaped.
 */
export function escapeRegExpChars(str: string): string {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

const pathForbiddenCharsRegExp = /[/\\*?<>|:"]/g;

/**
 * Replaces path-forbidden characters with a hyphen.
 *
 * This helper replaces characters matched by `pathForbiddenCharsRegExp`,
 * to make strings safer for cross-platform file and directory names.
 *
 * It is intended as a lightweight character replacement helper, not as a full
 * path or filename sanitizer.
 *
 * @param value - String in which forbidden path characters should be replaced.
 * @returns A new string with every forbidden character replaced with `-`.
 */
export function replacePathForbiddenChars(value: string): string {
  return value.replace(pathForbiddenCharsRegExp, '-');
}

/**
 * Replaces path-forbidden characters with a hyphen in every string in an array.
 *
 * This helper applies {@link replacePathForbiddenChars} to each element and
 * returns a new array without mutating the input.
 *
 * @param stringArray - Array of strings to sanitize.
 * @returns A new array with forbidden path characters replaced in every string.
 */
export function replacePathForbiddenCharsInArray(stringArray: readonly string[]): string[] {
  return stringArray.map((str) => replacePathForbiddenChars(str));
}

/**
 * Replaces problematic characters in audio tags with standardized equivalents.
 *
 * Intended as an expandable helper for cleaning metadata from various sources.
 *
 * @param str - String containing potentially problematic tag characters.
 * @returns A new string with problematic characters normalized.
 */
export function replaceTagForbiddenChars(str: string): string {
  return str
    .replaceAll(/[`’]/g, '\'') // replace weird apostrophes with the standard one: '
    .replaceAll(/[–—]/g, '-'); // replace en dash & em dash with the hyphen: -
}
