import {
  escapeRegExpChars,
} from '#tools';

/**
 * Returns whether the given artist entry appears to be a combined value made of
 * multiple artists that are already present as separate entries in the same list.
 *
 * @internal
 *
 * @param artist - Artist entry to validate.
 * @param artistArray - Deduplicated artist list used as a comparison base.
 *
 * @returns `true` when the entry looks like an aggregated artist value such as
 * `Artist A, Artist B`, while both `Artist A` and `Artist B` are already present
 * in the list as standalone entries; otherwise `false`.
 *
 * @remarks
 * This helper intentionally uses a narrow heuristic. It only checks comma-separated
 * entries and removes them only when every comma-separated part already exists as
 * a separate artist in the same list. The goal is to filter obvious API anomalies
 * such as duplicated combined artist fields without trying to fully parse all
 * possible artist separator formats.
 */
function isCombinedArtistEntry(artist: string, artistArray: readonly string[]): boolean {
  if (!artist.includes(',')) return false;

  const artistParts = artist
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (artistParts.length < 2) return false;

  return artistParts.every((artistPart) =>
    artistArray.some((arrayArtist) =>
      arrayArtist !== artist && arrayArtist.toLowerCase() === artistPart.toLowerCase(),
    ),
  );
}

/**
 * Builds a normalized artist list for tag writing.
 *
 * @param artistArray - Source artist names read from metadata or an external service.
 * Empty, blank, and duplicated values are removed from the returned list.
 *
 * @param title - Optional track title used to detect artists mentioned after the
 * `feat` or `ft` marker. When an artist appears in that part of the title, the
 * artist is excluded from the returned list to avoid duplicating the same artist
 * in both the main artist tag and the featured-artist part of the title.
 *
 * @returns A deduplicated array of normalized artist names with tag-forbidden
 * characters replaced. Returns an empty array when no artist information is provided.
 *
 * @remarks
 * This function intentionally uses a heuristic instead of trying to fully parse
 * featured-artist separators. It checks whether a normalized artist name appears
 * after a standalone `feat` or `ft` token in the title and treats that artist as
 * already represented by the title.
 *
 * The matching is deliberately permissive: it is designed to work well for common
 * track-title formats without overfitting to a fixed set of separators between
 * featured artists. This means rare edge cases may still produce false positives
 * or false negatives, but the implementation stays simple and predictable.
 *
 * After filtering featured artists, the function also removes obvious combined
 * artist entries, for example `Artist A, Artist B`, when all combined parts are
 * already present in the list as standalone artists. This is a narrow heuristic
 * intended to handle malformed API data without trying to parse every possible
 * artist-list format.
 *
 * Artist names are trimmed before processing. Blank names are ignored, and the
 * final output is deduplicated while preserving the first surviving occurrence.
 */
export function normalizeTrackArtists(artistArray: readonly string[] | null, title?: string): string[] {
  if (!artistArray) return [];

  const result: string[] = [];
  const normalizedTitle = title?.trim();

  for (const artist of artistArray) {
    const normalizedArtist = artist?.trim();
    if (!normalizedArtist) continue;

    // Search for feat/ft before the artist name.
    const featuredArtistPattern = new RegExp(
      `\\b(?:feat|ft)\\b.+${escapeRegExpChars(normalizedArtist)}`,
      'i',
    );

    const isFeaturedInTitle = !!normalizedTitle && featuredArtistPattern.test(normalizedTitle);

    if (!isFeaturedInTitle) {
      result.push(normalizedArtist);
    }
  }

  const uniqueArtists = Array.from(new Set(result)); // remove duplicates

  return uniqueArtists.filter((artist) => !isCombinedArtistEntry(artist, uniqueArtists));
}
