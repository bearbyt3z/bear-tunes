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

/**
 * Normalizes selected typographic characters in a text value.
 *
 * This helper replaces supported quote-like and dash-like characters with their
 * canonical ASCII equivalents so text from different sources stays consistent.
 *
 * @param value - Text value to normalize.
 * @returns Text with supported typographic characters normalized.
 */
export function normalizeTextCharacters(value: string): string {
  return value
    // normalize grave and right single quotation mark to ASCII apostrophe
    .replaceAll(/[`’]/g, '\'')
    // normalize en dash and em dash to ASCII hyphen-minus
    .replaceAll(/[–—]/g, '-');
}
