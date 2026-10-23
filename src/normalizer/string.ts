/**
 * Normalizes a raw string value.
 *
 * Trims leading and trailing whitespace. Returns `undefined` for non-string
 * values or strings that are empty after trimming.
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
 * Normalizes selected typographic punctuation characters.
 *
 * Replaces grave accents and curly single quotation marks with ASCII
 * apostrophes, and en and em dashes with ASCII hyphen-minus characters.
 * Other characters are left unchanged.
 *
 * @param value - Text value to normalize.
 * @returns Text with the supported typographic characters normalized.
 */
export function normalizeTextCharacters(value: string): string {
  return value
    // Normalize grave accents and curly single quotation marks to ASCII apostrophes.
    .replaceAll(/[`‘’]/g, '\'')
    // Normalize en and em dashes to ASCII hyphen-minus.
    .replaceAll(/[–—]/g, '-');
}
