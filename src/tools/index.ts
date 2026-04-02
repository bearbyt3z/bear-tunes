import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '@/logger';

export { prompt } from './cli/prompt';
export {
  arrayDifference,
  arrayIntersection,
  arrayToLowerCase,
} from './utils/array';
export { downloadFile } from './web/download-file';
export { downloadImage, downloadAndSaveArtwork } from './web/download-image';
export { fetchWebPage } from './web/fetch-web-page';

// const colonEscapeChar = (process.platform === "win32") ? '\\' : '\\\\';
const colonEscapeChar = '\\'; // the same on windows & linux platform...

export function escapeColonChar(str: string): string {
  return str.replace(/:/g, `${colonEscapeChar}:`);
}

/**
 * Replaces the filename extension in a filesystem path.
 *
 * @param filePath The filesystem path whose filename extension should be replaced.
 * @param replacement The new filename extension, with or without a leading dot.
 * @returns The input path with its filename extension replaced.
 * @throws {TypeError} If replacement is not a non-empty string.
 */
export function replaceFilenameExtension(filePath: string, replacement: string): string {
  if (typeof replacement !== 'string' || replacement === '') {
    throw new TypeError('Replacement must be a non-empty string.');
  }

  const parsed = path.parse(filePath);

  return path.format({
    dir: parsed.dir,
    root: parsed.root,
    // Omit `base`, because it takes priority over `name` and `ext`.
    name: parsed.name,
    ext: replacement,
  });
}

/**
 * Removes the filename extension from a filesystem path.
 *
 * @param filePath The filesystem path whose filename extension should be removed.
 * @returns The input path without its filename extension.
 */
export function removeFilenameExtension(filePath: string): string {
  const parsed = path.parse(filePath);

  return path.format({
    dir: parsed.dir,
    root: parsed.root,
    // Omit `base`, because it takes priority over `name` and `ext`.
    name: parsed.name,
    ext: '',
  });
}

export function replaceTagForbiddenChars(str: string): string {
  return str
    .replace(/[`’]/g, '\''); // replace weird apostrophes with '
}

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

export function regExpEscape(str: string): string {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// if title provided => remove featuring artists from artist list
export function createArtistArray(artistArray: string[] | null, title?: string): string[] {
  const result: string[] = []; // => delete frame if there is no artist information

  if (!artistArray) return result;

  for (const artist of artistArray) {
    if (artist && artist.length > 0
      && (title === undefined || title.search(new RegExp(`(feat|ft).+${regExpEscape(artist)}`, 'i')) < 0)) { // search for feat/ft before the artist name
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

// using the fastest solution from: https://stackoverflow.com/questions/11832914/how-to-round-to-at-most-2-decimal-places-if-necessary/48764436#48764436
export function roundToDecimalPlaces(num: number, decimalPlaces?: number) {
  const p = Math.pow(10, decimalPlaces || 0);
  const n = (num * p) * (1 + Number.EPSILON);
  return Math.round(n) / p;
}

export function secondsToTimeFormat(inputSeconds : number): string {
  inputSeconds = Math.round(inputSeconds);
  const hours = Math.floor(inputSeconds / 3600);
  const minutes = Math.floor((inputSeconds % 3600) / 60);
  const seconds = Math.floor(inputSeconds % 60);

  let result = '';
  if (hours > 0) {
    result += `${hours}:`;

    if (minutes < 10) {
      result += '0'; // minutes variable with zeroPad() below would end up in "04:13"-like format...
    }
  }

  result += `${minutes}:${zeroPad(seconds)}`;

  return result;
}

export function isEmptyObject(value: object): boolean {
  return Object.keys(value).length === 0;
}

const replaceRegEx = /[/\\*?<>|:"]/gm;

export function replacePathForbiddenChars(value: string): string {
  return value.replace(replaceRegEx, '-');
}

export function replacePathForbiddenCharsInArray(stringArray: readonly string[]): string[] {
  return stringArray.map((str) => replacePathForbiddenChars(str));
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

export function getRandomString(length = 20): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Attempts to parse a string into a {@link URL} object.
 *
 * Returns `undefined` when the input is missing or cannot be parsed as a valid URL.
 * Unlike calling `new URL()` directly, this helper does not throw for malformed input.
 *
 * @param str - URL string to parse.
 * @returns A parsed {@link URL} instance, or `undefined` when the input is empty or invalid.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URL/URL | MDN: URL() constructor}
 */
export function tryParseUrl(str?: string): URL | undefined {
  if (!str) return undefined;

  try {
    return new URL(str);
  } catch {
    return undefined;
  }
}

/**
 * Attempts to parse a value into a positive integer.
 *
 * Returns `undefined` when the input is missing, non-numeric, zero, or negative.
 *
 * @param value - Value to parse as positive integer.
 * @returns A parsed positive integer, or `undefined` when the input is invalid.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number | MDN: Number constructor}
 */
export function tryParsePositiveInteger(value: string | number | undefined): number | undefined {
  const result = Number(value);
  return (Number.isInteger(result) && result > 0) ? result : undefined;
}

function zeroPad(number: number): string {
  return (number < 10) ? `0${number}` : number.toString();
}

export function convertDateToString(date: Date): string {
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

/**
 * Capitalizes the first character of a string.
 *
 * Returns the original value unchanged when the input is an empty string.
 *
 * @param str - String to capitalize.
 * @returns A new string with the first character converted to uppercase.
 */
export function capitalize(str: string): string {
  if (!str) return str;

  return str.charAt(0).toUpperCase() + str.slice(1);
}
