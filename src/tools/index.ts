import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

import logger from '@/logger';
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
  roundToDecimalPlaces,
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

export function createTitle(trackName?: string, trackMixName?: string): string {
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

// if title provided => remove featuring artists from artist list
export function createArtistArray(artistArray: string[] | null, title?: string): string[] {
  const result: string[] = []; // => delete frame if there is no artist information

  if (!artistArray) return result;

  for (const artist of artistArray) {
    if (artist && artist.length > 0
      && (title === undefined || title.search(new RegExp(`(feat|ft).+${escapeRegExpChars(artist)}`, 'i')) < 0)) { // search for feat/ft before the artist name
      result.push(replaceTagForbiddenChars(artist));
    }
  }

  return result;
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
export function createGenreTag(genreName?: string, subgenreName?: string): string | undefined {
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
export function createKeyTag(keyString?: string): string | undefined {
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

export function slugify(text: string): string {
  const slug = text
    .replace(/[^a-z0-9\s]+/igm, '') // keep only alphanumerics & spaces
    .trim() // trim() must be after removing unwanted chars (spaces can appear at the beginning and the end)
    .replace(/\s+/g, '-') // create kebab case slug
    .toLowerCase();

  return slug;
}

/**
 * Converts a duration in seconds to a human-readable time string.
 *
 * The result uses `m:ss` format for durations shorter than one hour and
 * `h:mm:ss` format when at least one full hour is present.
 *
 * The input is first rounded to the nearest whole second with `Math.round()`,
 * then split into hours, minutes, and seconds using integer division.
 *
 * Only non-negative finite numbers are accepted. A `TypeError` is thrown for
 * invalid input such as `NaN`, `Infinity`, or negative values.
 *
 * @example
 * ```ts
 * secondsToTimeFormat(73); // "1:13"
 * secondsToTimeFormat(253); // "4:13"
 * secondsToTimeFormat(3853); // "1:04:13"
 * ```
 *
 * @param inputSeconds - Duration in seconds.
 * @returns Formatted duration string.
 * @throws {TypeError} When `inputSeconds` is not a non-negative finite number.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite | MDN: Number.isFinite()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round | MDN: Math.round()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/floor | MDN: Math.floor()}
 */
export function secondsToTimeFormat(inputSeconds : number): string {
  if (!Number.isFinite(inputSeconds) || inputSeconds < 0) {
    throw new TypeError('inputSeconds must be a non-negative finite number.');
  }

  const totalSeconds = Math.round(inputSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  let result = '';
  if (hours > 0) {
    result += `${hours}:`;

    if (minutes < 10) {
      result += '0'; // Zero-pad minutes only when hours are present.
    }
  }

  result += `${minutes}:${zeroPad(seconds)}`;

  return result;
}

export function leaveOnlyFirstLine(text: string): string {
  return text.replace(/\n.*/gmi, '');
}

export function getUrlFromFile(filePath: string): URL | null {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const urlIndex = fileContent.indexOf('URL=');
  if (urlIndex < 0) return null;
  return new URL(fileContent.substring(urlIndex + 4).split('\n')[0]);
}

/**
 * Converts a number to a string and prefixes it with `0` when it is a single digit.
 *
 * This helper is intended for time formatting such as seconds in `m:ss`
 * or `h:mm:ss` output.
 *
 * @param value - Number to format.
 * @returns A zero-padded string for values below `10`, otherwise the original number as a string.
 */
function zeroPad(value: number): string {
  return (value < 10) ? `0${value}` : value.toString();
}

/**
 * Formats a local date as an ISO 8601 calendar date string.
 *
 * The returned string uses the `YYYY-MM-DD` format based on the date's local
 * year, month, and day values.
 *
 * This helper uses local date getters (`getFullYear()`, `getMonth()`, and
 * `getDate()`), so the result is based on the local time zone rather than UTC.
 *
 * @param date - Date to format.
 * @returns A local date string in `YYYY-MM-DD` format.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getFullYear | MDN: Date.prototype.getFullYear()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getMonth | MDN: Date.prototype.getMonth()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getDate | MDN: Date.prototype.getDate()}
 * @see {@link https://www.iso.org/iso-8601-date-and-time-format.html | ISO 8601 date format}
 */
export function formatLocalDateToIsoDateString(date: Date): string {
  return `${date.getFullYear()}-${zeroPad(date.getMonth() + 1)}-${zeroPad(date.getDate())}`;
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
    logger.error(`ERROR: Child process exited with code ${child.status}:\n${leaveOnlyFirstLine(child.stderr)}`);
    return child.status;
  }

  logger.info(verbose ? child.stdout : successMessage);
  return 0;
}

export function getMimeTypeFromPath(filePath: string): string {
  const mimeType = childProcess.execSync(`file --mime-type -b "${filePath}"`).toString();
  return mimeType.trim();
}
