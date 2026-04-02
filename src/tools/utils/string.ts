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
