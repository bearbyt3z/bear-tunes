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
 * Normalizes typographic text characters into a canonical ASCII form.
 *
 * This helper replaces supported typographic variants with plain ASCII
 * equivalents so text from different sources stays consistent during
 * normalization and comparison.
 *
 * @param value - Text value to normalize.
 * @returns Text with typographic characters normalized to canonical ASCII equivalents.
 */
export function normalizeTextCharacters(value: string): string {
  return value
    // normalize grave accent and single quotation marks to ASCII apostrophe
    .replaceAll(/[`‘’]/g, '\'')
    // normalize en dash and em dash to ASCII hyphen-minus
    .replaceAll(/[–—]/g, '-');
}
