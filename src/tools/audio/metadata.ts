/**
 * Builds a genre tag in the `Genre | Sub-Genre` format.
 *
 * Both genre names are trimmed before formatting. If no main genre name is
 * provided, the function returns `undefined`. The optional sub-genre is
 * appended only when it is present and non-empty after trimming.
 *
 * The ` | ` separator matches Beatport's XML notation for track genres.
 *
 * @param genreName - Main genre name.
 * @param subgenreName - Optional sub-genre name.
 * @returns A formatted genre tag, or `undefined` when no main genre is available.
 *
 * @see {@link https://greenroomsupport.beatport.com/hc/en-us/articles/41043520429076-Beatport-Genres-Including-NEW-Open-Format-Genres | Beatport Genres and Sub-Genres}
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
 * Leading and trailing whitespace is removed from artist and title values before
 * they are combined. Empty or whitespace-only artist entries are ignored.
 *
 * If no artists or title are available, the function returns `undefined`.
 * If only one is available, the function returns that value after trimming.
 * Multiple artists are joined with `, `.
 *
 * @param trackMetadata - Object containing optional artists and title fields.
 * @param trackMetadata.artists - Optional list of artist names.
 * @param trackMetadata.title - Optional title value.
 * @returns Formatted track full name, or `undefined` when no artist or title is available.
 */
export function buildTrackFullName(
  trackMetadata: { artists?: string[]; title?: string },
): string | undefined {
  const artists = trackMetadata.artists
    ?.map((artist) => artist.trim())
    .filter(Boolean);

  const artistsLabel = artists?.length
    ? artists.join(', ')
    : undefined;

  const title = trackMetadata.title?.trim();

  if (artistsLabel && title) {
    return `${artistsLabel} - ${title}`;
  }

  return artistsLabel ?? title;
}

/**
 * Extracts searchable keywords from a track filename or name.
 *
 * The function removes a track number prefix, replaces selected punctuation
 * and spaced separators with whitespace, collapses repeated whitespace, and
 * returns de-duplicated keywords in their first-occurrence order.
 *
 * A track number is removed when it appears at the beginning of the track name
 * or after a dash-like separator surrounded by whitespace. The number must be
 * followed by a dot, hyphen, en dash, or em dash and whitespace. Parentheses,
 * square brackets, commas, hyphens, en dashes, em dashes, and ampersands
 * surrounded by whitespace are treated as separators. Other characters remain
 * part of their keywords.
 *
 * The function is intentionally conservative and does not attempt to infer
 * artist and title boundaries from arbitrary punctuation in the input.
 * This keeps the original filename under the user's control while removing
 * artifacts that are reliably identifiable for track searches.
 *
 * @param trackName - Track filename or track name from which to extract keywords.
 * @returns De-duplicated searchable keywords in their first-occurrence order,
 * or an empty array when no keywords can be extracted.
 *
 * @example
 * ```ts
 * extractTrackNameKeywords('01 - Artist - Title (Original Mix)');
 * // => ['Artist', 'Title', 'Original', 'Mix']
 * ```
 *
 * @example
 * ```ts
 * extractTrackNameKeywords('Artist Title (RemixerArtist Extended Remix)');
 * // => ['Artist', 'Title', 'RemixerArtist', 'Extended', 'Remix']
 * ```
 */
export function extractTrackNameKeywords(trackName: string): string[] {
  const normalizedTrackName = trackName
    // Remove a track number prefix at the beginning or after a spaced dash-like
    // separator. A number is treated as a track number only when followed by a
    // dot or another spaced dash-like separator, avoiding removal of numbers that
    // may belong to the artist or title.
    .replace(/(^|\s+[-–—]\s+)\d+\s*[-–—.]\s+/, ' ')

    // Replace brackets and commas with spaces so their contents become
    // separate searchable keywords.
    .replaceAll(/[()[\],]/g, ' ')

    // Replace spaced dash-like separators and ampersands with spaces.
    // Only separators surrounded by whitespace are treated this way,
    // so characters such as the ampersand in "AT&T" remain part of a keyword.
    .replaceAll(/\s+[-–—&]\s+/g, ' ')

    // Collapse repeated whitespace into a single space.
    .replaceAll(/\s+/g, ' ')

    // Remove leading and trailing whitespace introduced by normalization.
    .trim();

  if (!normalizedTrackName) {
    return [];
  }

  // De-duplicate keywords while preserving their first occurrence order.
  return Array.from(new Set(normalizedTrackName.split(' ')));
}
