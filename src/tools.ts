import fetch from 'node-fetch';
import * as jsdom from 'jsdom';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as childProcess from 'child_process';
import * as path from 'path';
import UserAgent from 'user-agents';

import type { UACache, UAProfile } from './tools.types';

import { TrackInfo } from './types';

const logger = require('./logger');

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const UA_PROFILES: UAProfile[] = [
  {
    name: 'chrome-windows',
    match: /Chrome/,
    filter: { deviceCategory: 'desktop', platform: 'Win32' },
  },
  {
    name: 'firefox-windows',
    match: /Firefox/,
    filter: { deviceCategory: 'desktop', platform: 'Win32' },
  },
  {
    name: 'safari-macos',
    match: /Safari/,
    filter: { deviceCategory: 'desktop', platform: 'MacIntel' },
  },
  {
    name: 'chrome-mobile',
    match: /(Chrome|CriOS)/,
    filter: { deviceCategory: 'mobile' },
  },
  {
    name: 'safari-mobile',
    match: /Version\/.*Mobile\/.*Safari\//,
    filter: { deviceCategory: 'mobile' },
  },
];

const CACHE_DIR = path.join(process.cwd(), '.cache');
const UA_CACHE_FILE = path.join(CACHE_DIR, 'user-agent.json');

function randomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new Error(`Invalid randomInt range: min=${min}, max=${max}`);
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTtlMs(minDays = 3, maxDays = 10): number {
  const minMs = minDays * MILLISECONDS_PER_DAY;
  const maxMs = maxDays * MILLISECONDS_PER_DAY;
  return randomInt(minMs, maxMs);
}

function pickRandomProfile(): UAProfile {
  return UA_PROFILES[randomInt(0, UA_PROFILES.length - 1)];
}

function generateUserAgent(profile: UAProfile): string {
  return new UserAgent([profile.match, profile.filter]).toString();
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const dirPath = path.dirname(filePath);
  const tempFilePath = path.join(
    dirPath,
    `.tmp-${path.basename(filePath)}-${process.pid}-${crypto.randomUUID()}`
  );

  await ensureDir(dirPath);
  await fs.promises.writeFile(tempFilePath, content, 'utf8');
  await fs.promises.rename(tempFilePath, filePath);
}

function isValidUACache(value: unknown): value is UACache {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const cache = value as Record<string, unknown>;

  return (
    typeof cache.userAgent === 'string' &&
    cache.userAgent.length > 0 &&
    typeof cache.profileName === 'string' &&
    typeof cache.createdAt === 'number' &&
    Number.isFinite(cache.createdAt) &&
    typeof cache.expiresAt === 'number' &&
    Number.isFinite(cache.expiresAt)
  );
}

export async function getUserAgent(): Promise<string> {
  const now = Date.now();
  const cached = await readJsonFile<unknown>(UA_CACHE_FILE);

  if (isValidUACache(cached) && cached.expiresAt > now) {
    return cached.userAgent;
  }

  const profile = pickRandomProfile();
  const userAgent = generateUserAgent(profile);

  const cache: UACache = {
    userAgent,
    profileName: profile.name,
    createdAt: now,
    expiresAt: now + randomTtlMs(7, 14),
  };

  await writeFileAtomic(UA_CACHE_FILE, JSON.stringify(cache, null, 2));

  return cache.userAgent;
}

export async function buildSafeHeaders(): Promise<Record<string, string>> {
  const userAgent = await getUserAgent();

  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };
}

export async function fetchWebPage(url: URL): Promise<Document> {
  const headers = await buildSafeHeaders();

  const response = await fetch(url.toString(), {
    headers: headers,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for "${url.toString()}"`);
  }

  const html = await response.text();
  return new jsdom.JSDOM(html).window.document;
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
      filenameComputed = `${filename}.${urlFilenameExtension}`;
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
