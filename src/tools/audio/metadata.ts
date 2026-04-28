/**
 * Builds a genre tag in the `Genre | Sub-Genre` format.
 *
 * If no main genre name is provided, the function returns `undefined`.
 * The optional sub-genre is appended only when it is present and non-empty.
 * The ` | ` separator matches Beatport's XML notation for track genres.
 *
 * @param genreName - Main genre name.
 * @param subgenreName - Optional sub-genre name.
 * @returns A formatted genre tag, or `undefined` when no main genre is available.
 *
 * @see {@link https://greenroomsupport.beatport.com/hc/en-us/articles/9709209306772-Beatport-Genres-and-Sub-Genres | Beatport Genres and Sub-Genres }
 */
export function buildGenreTag(genreName?: string, subgenreName?: string): string | undefined {
  const normalizedGenreName = genreName?.trim();
  if (!normalizedGenreName) {
    return undefined;
  }

  const normalizedSubgenreName = subgenreName?.trim();

  return normalizedSubgenreName ? `${normalizedGenreName} | ${normalizedSubgenreName}` : normalizedGenreName;
}

/**
 * Builds an ID3-compatible key tag for the TKEY / INITIALKEY field.
 *
 * The returned value uses a compact musical key notation without whitespace,
 * for example `C`, `G#m`, `Bb`, or `Cbm`. Flat and sharp symbols are normalized
 * to `b` and `#`, and major/minor suffixes are converted to the ID3-compatible form.
 *
 * If no key string is provided, the function returns `undefined`.
 *
 * @param keyString - Human-readable musical key string, for example `C Major`.
 * @returns Normalized key tag value, or `undefined` when no key is available.
 * @throws Error when the normalized key exceeds the 3-character limit of TKEY / INITIALKEY.
 *
 * @see {@link https://mutagen-specs.readthedocs.io/en/latest/id3/id3v2.2.html | Mutagen ID3 specification}
 * @see {@link https://docs.mp3tag.de/mapping/ | Mp3tag field mappings}
 */
export function buildKeyTag(keyString?: string): string | undefined {
  if (!keyString) return undefined;

  const keyTag = keyString.trim()
    .replaceAll(/♭\s*/g, 'b')
    .replaceAll(/♯\s*/g, '#')
    .replace(/maj(or)?/i, '')
    .replace(/min(or)?/i, 'm')
    .replaceAll(/\s+/g, ''); // key signatures do not contain whitespace, e.g. Cbm, G#m, B#, B

  if (keyTag.length > 3) {
    throw new Error(`Invalid key tag "${keyTag}": maximum length for TKEY / INITIALKEY is 3 characters.`);
  }

  return keyTag;
}

/**
 * Extracts normalized keywords from a track name.
 *
 * The function normalizes common separators and punctuation in the provided
 * track name string and returns a de-duplicated array of keywords.
 *
 * @param trackName - Track name as a single string.
 * @returns Array of normalized keywords, or an empty array when no keywords can
 * be extracted from the input.
 *
 * @example
 * extractTrackNameKeywords('01 - Artist - Title (Original Mix)')
 * // => ['Artist', 'Title', 'Original', 'Mix']
 *
 * @example
 * extractTrackNameKeywords('Artist Title (Extended Remix)')
 * // => ['Artist', 'Title', 'Extended', 'Remix']
 */
export function extractTrackNameKeywords(trackName: string): string[] {
  const normalizedTrackName = trackName
    // remove a track number prefix at the beginning or after a separated title segment
    .replace(/(^|(\s+-\s+))\d+\s*[-.]\s+/, ' ')
    // replace brackets and commas with a single space
    .replaceAll(/[()[\],]/g, ' ')
    // replace dash-like separators and ampersands surrounded by spaces with a single space
    .replaceAll(/\s+[-–&]\s+/g, ' ')
    // collapse repeated whitespace into a single space
    .replaceAll(/\s{2,}/g, ' ')
    // remove leading and trailing whitespace
    .trim();

  if (!normalizedTrackName) {
    return [];
  }

  // de-duplicate keywords while preserving their first occurrence order
  return Array.from(new Set(normalizedTrackName.split(' ')));
}
