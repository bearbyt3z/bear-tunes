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
 * Builds a human-readable track full name in the `Artist 1, Artist 2 - Title` format.
 *
 * The function only combines the provided values and does not normalize
 * or sanitize the input.
 *
 * If both `artists` and `title` are missing, the function returns `undefined`.
 * If only one of them is available, the function returns only that part.
 *
 * @param trackMetadata - Object containing optional artists and title fields.
 * @param trackMetadata.artists - Optional list of artists.
 * @param trackMetadata.title - Optional title value.
 * @returns Formatted track full name, or `undefined` when no displayable data is available.
 */
export function buildTrackFullName(
  trackMetadata: { artists?: string[]; title?: string },
): string | undefined {
  const artistsLabel = trackMetadata.artists && trackMetadata.artists.length > 0
    ? trackMetadata.artists.join(', ')
    : undefined;

  if (artistsLabel && trackMetadata.title) {
    return `${artistsLabel} - ${trackMetadata.title}`;
  }

  return artistsLabel ?? trackMetadata.title;
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
