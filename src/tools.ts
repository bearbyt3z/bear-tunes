import fetch from 'node-fetch';
import * as jsdom from 'jsdom';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as childProcess from 'child_process';
import * as path from 'path';
import { TrackInfo } from './types';

const logger = require('./logger');

export async function fetchWebPage(url: URL): Promise<HTMLDocument> {
  const response = await fetch(url.toString())
    .then((res) => res.text())
    .catch((error) => logger.error(error));
  return (new jsdom.JSDOM(response)).window.document;
}

export function arrayDifference(array1: unknown[], array2: unknown[]): unknown[] {
  return array1.filter((value) => !array2.includes(value));
}

export function arrayIntersection(array1: unknown[], array2: unknown[]): unknown[] {
  return array1.filter((value) => array2.includes(value));
}

export function arrayToLowerCase(array: string[]): string[] {
  return array.map((value) => value.toLowerCase());
}

export function downloadFile(url: URL, filename?: string, callback?: (filename: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!url) return reject('Proper URL is needed to download a file.');

    const urlSplit = url.pathname.split('/');
    const urlFilename = urlSplit[urlSplit.length - 1];
    let filenameComputed: string;

    if (!filename || filename.length < 1) {
      filenameComputed = urlFilename;
    } else if (filename.split('.').length < 2) { // no extension
      const urlFilenameSplit = urlFilename.split('.');
      const urlFilenameExtension = urlFilenameSplit[urlFilenameSplit.length - 1];
      filenameComputed = filename + urlFilenameExtension;
    } else {
      filenameComputed = filename;
    }

    fetch(url.toString())
      .then((response) => response.body)
      .then((body) => {
        if (!body) {
          reject(`Failed to download a file: ${filenameComputed} (response body is null)`);
        } else {
          body?.pipe(fs.createWriteStream(filenameComputed))
            .on('close', () => {
              resolve(`File created successfully: ${filenameComputed}`);
              if (callback !== undefined) callback(filenameComputed);
            })
            .on('error', (error) => {
              logger.error(error);
              reject(error);
            });
        }
    });
  });
}

export async function downloadAndSaveArtwork(trackPath: string, trackInfo: TrackInfo) {
  if (trackInfo.album?.artwork?.pathname.includes('.')) {
    const artworkExtension = trackInfo.album.artwork.pathname.split('.')?.pop() || '.unrecognized';
    const artworkPath = replaceFilenameExtension(trackPath, `.${artworkExtension}`);
    
    await downloadFile(trackInfo.album.artwork, artworkPath);
    logger.info(`Artwork written to: "${artworkPath}"`);
  }
}

// const colonEscapeChar = (process.platform === "win32") ? '\\' : '\\\\';
const colonEscapeChar = '\\'; // the same on windows & linux platform...

export function escapeColonChar(str: string): string {
  return str.replace(/:/g, `${colonEscapeChar}:`);
}

export function replaceFilenameExtension(filename: string, replacement: string) : string {
  return filename.replace(new RegExp(`${path.extname(filename)}$`), replacement);
}

export function replaceTagForbiddenChars(str: string): string {
  return str
    .replace(/[`’]/g, '\''); // replace weird apostrophes with '
}

export function splitTrackNameIntoKeywords(name: string | string[]): string[] {
  let nameComputed = (name instanceof Array) ? name.join(' ') : name;

  nameComputed = nameComputed
    .replace(/(^|(\s+-\s+))\d+\s*[-.]\s+/, ' ') // remove track number (at the beggining or in the middle)
    .replace(/[()[\],]/g, ' ') // replace brackets & comma with a single space
    .replace(/\s+[-–&]\s+/g, ' ') // replace dash & ampersand (etc.) surrounded by spaces with a single space
    .replace(/\s{2,}/g, ' ') // replace multiple whitespace chars with a single space
    .trim(); // remove spaces at the beggining & end
  
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

export function createGenreTag(genre?: string, subgenre?: string): string {
  if (!genre) return ''; // '' => delete frame if there is no genre information

  let result = genre;

  // check if sub-genre provided and it's not empty (an empty string is a falsy value)
  if (subgenre) genre += ` | ${subgenre}`; // separator same as: https://labelsupport.beatport.com/hc/en-us/articles/9709209306772-Beatport-Genres-and-Sub-Genres

  return result;
}

// keyString e.g.: 'C Major'
// https://mutagen-specs.readthedocs.io/en/latest/id3/id3v2.2.html
// https://docs.mp3tag.de/mapping/
export function createKeyTag(keyString: string): string {
  const keyTag = keyString.trim()
    .replace('♭ ', 'b')
    .replace('♯ ', '#')
    .replace(/maj(or)?/i, '')
    .replace(/min(or)?/i, 'm')
    .replace(/\s+/g, ''); // there are no whitespaces in key signature e.g.: Cbm, G#m, B#, B etc.

  if (keyTag.length > 3) throw new Error(`Maximum length (= 3) of key tag (TKEY / INITIALKEY) exceeded (${keyTag.length}).`);
    
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

export function isString(value: unknown): boolean {
  return typeof value === 'string' || value instanceof String;
}

export function isEmptyObject(value: object): boolean {
  return Object.keys(value).length === 0;
}

const replaceRegEx = /[/\\*?<>|:"]/gm;
export function replacePathForbiddenChars(stringOrArray: string | string[]): string | string[] {
  if (isString(stringOrArray)) {
    return (stringOrArray as string).replace(replaceRegEx, '-');
  }

  // otherwise it's an array
  return (stringOrArray as string[]).map((str) => str.replace(replaceRegEx, '-'));
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

export function isInteger(value: unknown): boolean {
  return !Number.isNaN(value) && parseInt(Number(value).toString(), 10) === value && !Number.isNaN(parseInt(value.toString(), 10));
}

export function getPositiveIntegerOrUndefined(str: string): number | undefined {
  const result = Number(str);
  return (isInteger(result) && result > 0) ? result : undefined;
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
