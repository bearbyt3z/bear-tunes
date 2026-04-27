import {
  escapeRegExpChars,
  replaceTagForbiddenChars,
} from '../utils/string.js';
import { isReadonlyStringArray } from '../utils/type-guards.js';

/**
 * Transforms a text value into a metadata-safe form for audio tags.
 *
 * This helper prepares text values before writing them to MP3 or FLAC metadata
 * fields.
 *
 * @param value - Text value to transform for audio metadata tags.
 * @returns Text value transformed into a metadata-safe form.
 */
export function sanitizeMetadataTagValue(value: string): string {
  return replaceTagForbiddenChars(value);
}

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
export function buildArtistArray(artistArray: readonly string[] | null, title?: string): string[] {
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
      result.push(replaceTagForbiddenChars(normalizedArtist));
    }
  }

  const uniqueArtists = Array.from(new Set(result)); // remove duplicates

  return uniqueArtists.filter((artist) => !isCombinedArtistEntry(artist, uniqueArtists));
}

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
 * The function accepts either a single track name string or an array of track
 * name fragments, joins the input into one string when needed, normalizes common
 * separators and punctuation, sanitizes problematic tag characters, and returns
 * a de-duplicated array of keywords.
 *
 * @param trackName - Track name as a single string or an array of string fragments.
 * @returns Array of normalized keywords, or an empty array when no keywords can
 * be extracted from the input.
 *
 * @example
 * extractTrackNameKeywords('01 - Artist - Title (Original Mix)')
 * // => ['Artist', 'Title', 'Original', 'Mix']
 *
 * @example
 * extractTrackNameKeywords(['Artist', 'Title (Extended Remix)'])
 * // => ['Artist', 'Title', 'Extended', 'Remix']
 */
export function extractTrackNameKeywords(trackName: string | readonly string[]): string[] {
  const joinedTrackName = isReadonlyStringArray(trackName) ? trackName.join(' ') : trackName;

  const normalizedTrackName = replaceTagForbiddenChars(
    joinedTrackName
      // remove a track number prefix at the beginning or after a separated title segment
      .replace(/(^|(\s+-\s+))\d+\s*[-.]\s+/, ' ')
      // replace brackets and commas with a single space
      .replaceAll(/[()[\],]/g, ' ')
      // replace dash-like separators and ampersands surrounded by spaces with a single space
      .replaceAll(/\s+[-–&]\s+/g, ' ')
      // collapse repeated whitespace into a single space
      .replaceAll(/\s{2,}/g, ' ')
      // remove leading and trailing whitespace
      .trim(),
  );

  if (!normalizedTrackName) {
    return [];
  }

  // de-duplicate keywords while preserving their first occurrence order
  return Array.from(new Set(normalizedTrackName.split(' ')));
}
