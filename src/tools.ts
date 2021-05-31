import fetch from 'node-fetch';
import * as jsdom from 'jsdom';
import * as fs from 'fs';
import * as request from 'request';
import * as crypto from 'crypto';

const logger = require('./logger');

export async function fetchWebPage(url: string): Promise<HTMLDocument> {
  const response = await fetch(url)
    .then((res) => res.text())
    .catch((error) => logger.error(error));
  return (new jsdom.JSDOM(response)).window.document;
}

export function arrayDifference(array1: Array<any>, array2: Array<any>): Array<any> {
  return array1.filter((value) => !array2.includes(value));
}

export function arrayIntersection(array1: Array<any>, array2: Array<any>): Array<any> {
  return array1.filter((value) => array2.includes(value));
}

export function arrayToLowerCase(array: Array<string>): Array<string> {
  return array.map((value) => value.toLowerCase());
}

export function downloadFile(uri: string, filename: string | null, callback: (filename: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    // request.head(uri, async (error, response, body) => {
    // console.log('content-type:', response.headers['content-type']);
    // console.log('content-length:', response.headers['content-length']);
    const uriSplit = uri.split('/');
    const uriFilename = uriSplit[uriSplit.length - 1];
    let filenameComputed = filename;

    if (!filename || filename.length < 1) {
      filenameComputed = uriFilename;
    } else if (filename.split('.').length < 2) { // no extension
      const uriFilenameSplit = uriFilename.split('.');
      const uriFilenameExtension = uriFilenameSplit[uriFilenameSplit.length - 1];
      filenameComputed = filename + uriFilenameExtension;
    }

    // request(uri).pipe(fs.createWriteStream(filenameComputed)).on('close', callback(filenameComputed));
    request(uri).pipe(fs.createWriteStream(filenameComputed))
      .on('close', () => {
        resolve(`File created successfully: ${filenameComputed}`);
        callback(filenameComputed);
      })
      .on('error', (error) => {
        logger.error(error);
        reject(error);
      });
    // request(uri).pipe(fs.WriteSync(filename)).on('close', callback(filename));
  });
}

// replaceFilenameExtension: filename => filename.replace(/\.[^\\/.]+$/, ''),  // it's easier to use path module

export function splitTrackNameToKeywords(name: string | Array<string>): Array<string> {
  let nameComputed = (name instanceof Array) ? name.join(' ') : name;
  nameComputed = nameComputed.trim(); // remove spaces at the beggining & end
  nameComputed = nameComputed.replace(/\s+[-–&]\s+|\s+/mgi, ' ');
  // nameComputed = nameComputed.replace(/[\(\)\[\],]|\.[\w\d]+?$/mgi, ''); // +? => non-greedy for file extension match
  // => don't work with: Lust 2.1.mp3
  nameComputed = nameComputed.replace(/[()[\],]|\.mp3$/mgi, ''); // +? => non-greedy for file extension match
  return Array.from(new Set(nameComputed.split(' '))); // set to avoid repetitions
  // return name.match(/\b([\w\d]+)\b/mgi);
}

export function createTitle(titleNode: HTMLElement, remixedNode: HTMLElement|null): string {
  let title = titleNode.textContent.trim();
  if (title.match(/\bfeat\b/i)) {
    title = title.replace(/\bfeat\.? /i, 'feat. '); // add missing dot after "feat" shortcut, and replace "Feat" with "feat"
    if (title.indexOf('(feat') < 0) { // if "feat" isn't in parentheses add them
      title = `${title.replace(/\bfeat. /, '(feat. ')})`;
    }
  }
  if (remixedNode) title = `${title} (${remixedNode.textContent.trim()})`;
  return title;
}

// if title provided => remove featuring artists from artist list
export function createArtistsList(artistsNode: HTMLElement, title: string = ''): string {
  if (!artistsNode) return ''; // '' => delete frame if there is no artist information
  const artistsLinks = artistsNode.querySelectorAll('a');
  if (artistsLinks.length > 0) {
    return Array.from(artistsLinks).reduce((result: Array<string>, link: HTMLAnchorElement) => {
      const artist = link.textContent.trim();
      // we have to search for feat/ft before artist name
      if (title.search(new RegExp(`(feat|ft).+${module.exports.regExpEscape(artist)}`, 'i')) < 0) {
        result.push(artist);
      }
      return result;
    }, []).join(', ');
  }
  return artistsNode.textContent.trim();
  // return (artistsLinks.length > 0) ? Array.from(artistsLinks).map(link => link.textContent.trim())).join(', ') : artistsNode.textContent.trim();
}

export function createGenresList(genresNode: HTMLElement|null): string {
  if (!genresNode) return ''; // '' => delete frame if there is no genre information
  const genresLinks = genresNode.querySelectorAll('a');
  if (genresLinks.length > 0) {
    return Array.from(genresLinks).reduce((result: string, link: HTMLAnchorElement) => {
      const genre = link.textContent.trim();
      const separator = result && (link.href.indexOf('sub-genre') >= 0 ? ': ' : ', '); // only if result != ''
      return result + separator + genre;
    }, '');
  }
  return genresNode.textContent.trim();
  // return (artistsLinks.length > 0) ? Array.from(artistsLinks).map(link => link.textContent.trim())).join(', ') : artistsNode.textContent.trim();
}

export function createKey(keyNode: HTMLElement): string {
  return keyNode.textContent.trim()
    .replace('♭ ', 'b')
    .replace('♯ ', '#')
    .replace('maj', 'M')
    .replace('min', 'm');
}

export function regExpEscape(str: any): string { // TODO: any?
  return String(str).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function isString(value: any): boolean {
  return typeof value === 'string' || value instanceof String;
}

const replaceRegEx = /[/\\*?<>|:"]/gm;
export function replacePathForbiddenChars(stringOrArray: string|Array<string>): string|Array<string> {
  if (isString(stringOrArray)) {
    return (stringOrArray as string).replace(replaceRegEx, '-');
  }

  // otherwise it's an array
  return (stringOrArray as Array<string>).map((str) => str.replace(replaceRegEx, '-'));
}

export function leaveOnlyFirstLine(text: string): string {
  return text.replace(/\n.*/gmi, '');
}

export function getUrlFromFile(filePath: string): string {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const urlIndex = fileContent.indexOf('URL=');
  if (!urlIndex) return null;
  return fileContent.substring(urlIndex + 4).split('\n')[0];
}

export function getRandomString(length = 20): string {
  return crypto.randomBytes(length).toString('hex');
}
