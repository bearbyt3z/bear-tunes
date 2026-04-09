import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

import logger from '@/logger';
import { getFirstLine } from './utils/format';
import {
  capitalize,
  escapeRegExpChars,
  replaceTagForbiddenChars,
} from './utils/string';
import { isReadonlyStringArray } from './utils/type-guards';

export { prompt } from './cli/prompt';
export {
  arrayDifference,
  arrayIntersection,
  arrayToLowerCase,
} from './utils/array';
export {
  formatLocalDateToIsoDateString,
  getFirstLine,
  roundToDecimalPlaces,
  secondsToTimeFormat,
  slugify,
} from './utils/format'
export {
  tryParsePositiveInteger,
  tryParseUrl,
} from './utils/parse';
export {
  removeFilenameExtension,
  replaceFilenameExtension,
} from './utils/path';
export { generateRandomHexString } from './utils/random';
export {
  capitalize,
  escapeRegExpChars,
  escapeUnescapedColons,
  replacePathForbiddenChars,
  replacePathForbiddenCharsInArray,
  replaceTagForbiddenChars,
} from './utils/string';
export {
  isReadonlyStringArray,
  isEmptyPlainObject,
} from './utils/type-guards';
export { downloadFile } from './web/download-file';
export { downloadImage, downloadAndSaveArtwork } from './web/download-image';
export { fetchWebPage } from './web/fetch-web-page';

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
      .trim()
  );

  if (!normalizedTrackName) {
    return [];
  }

  return Array.from(new Set(normalizedTrackName.split(' '))); // remove duplicates
}

/**
 * A single step in the title normalization pipeline.
 *
 * Each step receives the current title value and returns the normalized value
 * passed to the next step.
 */
type TitleNormalizationStep = (title: string) => string;

/**
 * Ordered pipeline used to normalize a built track title.
 *
 * The order is intentional and must be preserved, because some steps depend on
 * the output produced by earlier ones.
 */
const titleNormalizationPipeline = [
  normalizeTitleSpacingAndParentheses,
  normalizeTitleMixNames,
  normalizeTitleCapitalization,
] as const satisfies readonly TitleNormalizationStep[];

/**
 * Normalizes the "feat" fragment inside a title.
 *
 * Standardizes the featuring marker to `feat.` and wraps it in parentheses when
 * it is present but not already enclosed.
 *
 * @param title - Raw track title.
 * @returns Title with normalized featuring notation.
 *
 * @example
 * normalizeFeaturingInTitle('Title of a Track feat Someone')
 * // => 'Title of a Track (feat. Someone)'
 *
 * @example
 * normalizeFeaturingInTitle('Title of a Track (feat. Someone)')
 * // => 'Title of a Track (feat. Someone)'
 */
function normalizeFeaturingInTitle(title: string): string {
  if (!/\bfeat\b/i.test(title)) {
    return title;
  }

  // add a missing dot after the "feat" marker and normalize "Feat" to "feat"
  let normalizedTitle = title.replace(/\bfeat\.? /i, 'feat. ');

  // if "feat" is not enclosed in parentheses, add them
  if (!normalizedTitle.includes('(feat')) {
    normalizedTitle = `${normalizedTitle.replace(/\bfeat\. /, '(feat. ')})`;
  }

  return normalizedTitle;
}

/**
 * Normalizes spacing and bracket usage in a title.
 *
 * This step fixes spacing around parentheses, collapses repeated whitespace,
 * converts square brackets to parentheses, and removes duplicated outer
 * parentheses created by earlier transformations or input inconsistencies.
 *
 * @param title - Title to normalize.
 * @returns Title with normalized spacing and parentheses.
 */
function normalizeTitleSpacingAndParentheses(title: string): string {
  return title
    .replaceAll(/\)\(/g, ') (') // add space between parentheses
    .replaceAll(/\s+\)/g, ')') // remove spaces before closing parentheses
    .replaceAll(/\(\s+/g, '(') // remove spaces after opening parentheses
    .replaceAll(/\s{2,}/g, ' ') // replace multiple whitespace chars with a single space
    .replaceAll(/\[(.*)\]/g, '($1)') // replace square brackets by parentheses
    .replaceAll(/\({2}(.*)\){2}/g, '($1)'); // replace doubled parentheses with a single one
}

/**
 * Reorders nested remix parentheses into separate title fragments.
 *
 * This callback is used by `String.prototype.replace()` to transform nested
 * forms such as `(FirstArtist Remix (SecondArtist Re-Edit))` into
 * `(FirstArtist Remix) (SecondArtist Re-Edit)`.
 *
 * @param _fullMatch - Full regex match, unused by the transformation.
 * @param remixPart - Main remix fragment.
 * @param nestedPart - Nested fragment that should become a separate parenthesized part.
 * @returns Reordered remix fragments.
 */
function normalizeNestedRemixParentheses(
  _fullMatch: string,
  remixPart: string,
  nestedPart: string,
): string {
  return remixPart.replace(nestedPart, '') + nestedPart;
}

/**
 * Normalizes mix and remix naming inside a title.
 *
 * This step repairs common mix-label inconsistencies, such as missing `Mix`,
 * shorthand `RMX`, duplicated mix fragments, and nested remix parentheses.
 *
 * @param title - Title to normalize.
 * @returns Title with normalized mix and remix naming.
 *
 * @example
 * normalizeTitleMixNames('Title of a Track (Original)')
 * // => 'Title of a Track (Original Mix)'
 *
 * @example
 * normalizeTitleMixNames('Title of a Track - Artist Remix (Original Mix)')
 * // => 'Title of a Track (Artist Remix)'
 */
function normalizeTitleMixNames(title: string): string {
  return title
    // add the missing "Mix" suffix
    .replace(/\((Original|Extended|Instrumental|Dub)\)/i, '($1 Mix)')
    // replace the "RMX" shorthand with "Remix"
    .replace(/\((.*)RMX(.*)\)/i, '($1Remix$2)')
    // remove a duplicated mix/remix fragment (for example one coming from both the title and mix_name)
    .replace(/(\(.*\b(\sMix|Mix\s|\sRemix|Remix\s)\b.*\))\s*(\(.*\b(Mix|Remix)\b.*\))/i, '$1')
    // e.g.: "Title of a Track - Artist Remix (Original Mix)"
    // => "Title of a Track (Artist Remix)"
    .replace(/(-|–)\s+(.*Remix)\s+\(Original Mix\)/i, '($2)')
    // e.g.: "Title of a Track (FirstArtist Remix (SecondArtist Re-Edit))"
    // => "Title of a Track (FirstArtist Remix) (SecondArtist Re-Edit)"
    .replace(/(\(.*\sRemix(\s+\(.*\))\))/, normalizeNestedRemixParentheses);
}

/**
 * Normalizes capitalization of common release and mix keywords.
 *
 * This step capitalizes well-known release and version markers used in track
 * titles, such as `Original`, `Extended`, `Mix`, `Remix`, and `Edit`.
 *
 * @param title - Title to normalize.
 * @returns Title with normalized keyword capitalization.
 */
function normalizeTitleCapitalization(title: string): string {
  return title.replaceAll(
    /\b(original|extended|instrumental|dub|radio|mix|remix|edit|demo|tape)\b/g,
    capitalize,
  );
}

/**
 * Runs the ordered title normalization pipeline.
 *
 * The function applies all defined normalization steps sequentially. The
 * pipeline order is part of the normalization contract and should not be changed
 * casually.
 *
 * @param title - Title to normalize.
 * @returns Fully normalized title.
 */
function runTitleNormalizationPipeline(title: string): string {
  let normalizedTitle = title;

  for (const normalizeTitle of titleNormalizationPipeline) {
    normalizedTitle = normalizeTitle(normalizedTitle);
  }

  return normalizedTitle;
}

/**
 * Builds a normalized track title from a track name and optional mix name.
 *
 * The function trims inputs, normalizes featuring notation in the base title,
 * appends the mix name when provided, runs the title normalization pipeline,
 * and finally normalizes characters that are problematic in tag values.
 *
 * @param trackName - Base track name.
 * @param trackMixName - Optional mix/version name appended in parentheses.
 * @returns Normalized title ready to be stored in tags, or an empty string when
 * the base track name is missing.
 *
 * @example
 * buildTitle('Title of a Track feat Someone', 'Original')
 * // => 'Title of a Track (feat. Someone) (Original Mix)'
 */
export function buildTitle(trackName?: string, trackMixName?: string): string {
  const normalizedTrackName = trackName?.trim();
  if (!normalizedTrackName) {
    return '';
  }

  let title = normalizeFeaturingInTitle(normalizedTrackName);

  const normalizedMixName = trackMixName?.trim();
  if (normalizedMixName) {
    title += ` (${normalizedMixName})`;
  }

  title = runTitleNormalizationPipeline(title);

  return replaceTagForbiddenChars(title);
}

/**
 * Returns whether the given artist entry appears to be a combined value made of
 * multiple artists that are already present as separate entries in the same list.
 *
 * @internal
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

export function getUrlFromFile(filePath: string): URL | null {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const urlIndex = fileContent.indexOf('URL=');
  if (urlIndex < 0) return null;
  return new URL(fileContent.substring(urlIndex + 4).split('\n')[0]);
}

export function executeChildProcess(
  commandName: string,
  options: string[],
  successMessage: string,
  verbose: boolean = false
): number {
  const child = childProcess.spawnSync(commandName, options, { encoding: 'utf8' });

  if (child.error) {
    logger.error(`ERROR: Failed to start child process: ${child.error}`);
    return -1;
  }
  
  if (child.status && child.status !== 0) {
    logger.error(`ERROR: Child process exited with code ${child.status}:\n${getFirstLine(child.stderr)}`);
    return child.status;
  }

  logger.info(verbose ? child.stdout : successMessage);
  return 0;
}

export function getMimeTypeFromPath(filePath: string): string {
  const mimeType = childProcess.execSync(`file --mime-type -b "${filePath}"`).toString();
  return mimeType.trim();
}
