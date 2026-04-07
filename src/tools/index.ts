import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

import logger from '@/logger';
import { getFirstLine } from './utils/format';
import {
  escapeRegExpChars,
  replaceTagForbiddenChars,
} from './utils/string';

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
export { isEmptyPlainObject } from './utils/type-guards';
export { downloadFile } from './web/download-file';
export { downloadImage, downloadAndSaveArtwork } from './web/download-image';
export { fetchWebPage } from './web/fetch-web-page';

export function splitTrackNameIntoKeywords(name: string | string[]): string[] {
  let nameComputed = (name instanceof Array) ? name.join(' ') : name;

  nameComputed = nameComputed
    .replace(/(^|(\s+-\s+))\d+\s*[-.]\s+/, ' ') // remove track number (at the beginning or in the middle)
    .replace(/[()[\],]/g, ' ') // replace brackets & comma with a single space
    .replace(/\s+[-–&]\s+/g, ' ') // replace dash & ampersand (etc.) surrounded by spaces with a single space
    .replace(/\s{2,}/g, ' ') // replace multiple whitespace chars with a single space
    .trim(); // remove spaces at the beginning & end
  
  nameComputed = replaceTagForbiddenChars(nameComputed);

  return Array.from(new Set(nameComputed.split(' '))); // set to avoid repetitions
}

export function buildTitle(trackName?: string, trackMixName?: string): string {
  let title = trackName?.trim();
  if (!title || title.length < 1) return '';

  if (title.match(/\bfeat\b/i)) {
    title = title.replace(/\bfeat\.? /i, 'feat. '); // add missing dot after "feat" shortcut, and replace "Feat" with "feat"

    if (title.indexOf('(feat') < 0) { // if "feat" isn't in parentheses add them
      title = `${title.replace(/\bfeat\. /, '(feat. ')})`;
    }
  }

  const mixName = trackMixName?.trim();
  if (mixName && mixName.length > 0) {
    title += ` (${mixName})`;
  }

  title = title
    .replace(/\)\(/g, ') (') // add space between parentheses
    .replace(/\s+\)/g, ')')  // remove spaces before closing parentheses
    .replace(/\(\s+/g, '(')  // remove spaces after opening parentheses
    .replace(/\s{2,}/g, ' ')   // replace multiple whitespace chars with a single space
    .replace(/\[(.*)\]/g, '($1)') // replace square brackets by parentheses
    .replace(/\({2}(.*)\){2}/g, '($1)') // replace doubled parentheses with a single one
    .replace(/\((Original|Extended|Instrumental|Dub)\)/i, '($1 Mix)') // add missing 'Mix' word
    .replace(/\((.*)RMX(.*)\)/i, '($1Remix$2)') // RMX to Remix
    .replace(/(\(.*\b(\sMix|Mix\s|\sRemix|Remix\s)\b.*\))\s*(\(.*\b(Mix|Remix)\b.*\))/i, '$1') // remove doubled (* Mix/Remix *) mix name (one from name, another from mix_name)
    .replace(/(-|–)\s+(.*Remix)\s+\(Original Mix\)/i, '($2)') // e.g.: Bassturbation - Oyaebu Remix (Original Mix) => Bassturbation (Oyaebu Remix)
    .replace(/(\(.*\sRemix(\s+\(.*\))\))/, (unused, g1, g2) => g1.replace(g2, '') + g2) // e.g.: It's Our Future (Deadmau5 Remix (Cubrik Re-Edit)) => It's Our Future (Deadmau5 Remix) (Cubrik Re-Edit)
    .replace(/\b(original|extended|instrumental|dub|radio|mix|remix|edit|demo|tape)\b/g, (match, g1) => g1.charAt(0).toUpperCase() + g1.slice(1)); // first capital letter

  title = replaceTagForbiddenChars(title);

  return title;
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
 * Artist names are trimmed before processing. Blank names are ignored, and the
 * final output is deduplicated while preserving the first surviving occurrence.
 */
export function buildArtistArray(artistArray: string[] | null, title?: string): string[] {
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

  return Array.from(new Set(result)); // remove duplicates
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
  if (!genreName) return undefined;

  return subgenreName ? `${genreName} | ${subgenreName}` : genreName;
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
    .replace(/♭\s*/g, 'b')
    .replace(/♯\s*/g, '#')
    .replace(/maj(or)?/i, '')
    .replace(/min(or)?/i, 'm')
    .replace(/\s+/g, ''); // there are no whitespaces in key signature e.g.: Cbm, G#m, B#, B etc.

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
