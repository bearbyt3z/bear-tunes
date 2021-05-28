// https://github.com/aadsm/JavaScript-ID3-Reader
// ID3 tags reader in JavaScript (ID3v1, ID3v2 and AAC) http://www.aadsm.net/libraries/id3/

// https://antimatter15.com/wp/2010/07/a-bright-coloured-fish-parsing-id3v2-tags-in-javascript-and-extensionfm/
// https://github.com/antimatter15/js-id3v2

// https://wiki.hydrogenaud.io/index.php?title=Tag_Mapping
// http://id3.org/id3v2.4.0-frames
// https://eyed3.readthedocs.io/en/latest/plugins/classic_plugin.html
// https://eyed3.readthedocs.io/en/latest/_modules/eyed3/id3/frames.html
// https://readthedocs.org/projects/eyed3/downloads/pdf/latest/

// display plugin of eyeD3 requires grako:
// $pip install grako

'use strict';

import * as http from 'http';
import * as url from 'url';
import 'process'; // to assign process.exitCode (if imported with "* as process" => TS2540: Cannot assign to 'exitCode' because it is a read-only property.)
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const tools = require('./tools');
const logger = require('./logger');
import { BearTunesConverter, ConverterResult } from './converter';

const DOMAIN_URL = 'https://www.beatport.com';
const SEARCH_URL = DOMAIN_URL + '/search/tracks?per-page=150&q=';  // we want tracks only
// const SEARCH_URL = DOMAIN_URL + '/search/tracks?q=';  // we want tracks only
// const SEARCH_URL = DOMAIN_URL + '/search?q=';
const DISPLAY_PLUGIN_PATTERN_FILE = 'eyed3-pattern.txt';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

const tracksDirectory = process.argv[2] || '.';

interface TrackInfo {
  url?: string,
  artists?: string, // TODO: change to array
  title?: string,
  remixers?: string,
  released?: string, // TODO: change to Date type
  year?: string, // TODO: change to number/bigint/Date?
  genre?: string,
  bpm?: string, // TODO: int?
  key?: string,
  ufid?: string,
  waveform?: string, // TODO: URL
  publisher?: PublisherInfo,
  album?: AlbumInfo,
};

interface AlbumInfo {
  artists: string, // TODO: array
  title: string,
  catalogNumber: string, // TODO: int?
  trackNumber: string, // TODO: int
  trackTotal: string, // TODO: int
  url: string, // TODO: URL
  artwork: string, // TODO: URL
};

interface PublisherInfo {
  name: string,
  url: string, // TODO: URL
  logotype: string, // TODO: URL
}

const processAllFilesInDirectory = async directory => {
  if (!fs.existsSync(tracksDirectory)) {
    // logger.silly(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.verbose(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.debug(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.info(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.warn(`Path specified doesn't exist: ${tracksDirectory}`);
    logger.error(`Path specified doesn't exist: ${tracksDirectory}`);
    process.exitCode = 1;
    return;
    // process.exit(1);
  }

  if (!fs.statSync(tracksDirectory).isDirectory()) {
    logger.error(`Path specified isn't a directory: ${tracksDirectory}`);
    process.exitCode = 2;
    return;
    // process.exit(2);
  }

  fs.readdir(directory, async (error, files) => {
    const directoryWithSeparator: string = directory.replace(/\/+$/, path.sep);
    let noFilesWereProcessed = true;
    if (error) {
      logger.error(`Couldn't read directory: ${tracksDirectory}`);
      process.exitCode = 3;
      return;
      // process.exit(3);
    }
    // if (files.length < 1) {
    //   console.error(`There are no files in a directory: ${tracksDirectory}`);
    //   process.exit(4);  // breaks process when no files in subdirectory!!!
    // }
    const flacFiles: Array<string> = [];
    const converter: BearTunesConverter = new BearTunesConverter({}, true);

    for (const file of files) {
      const filePath = directoryWithSeparator + file;
      if (fs.statSync(filePath).isDirectory()) {
        processAllFilesInDirectory(filePath);
        continue;
      }
      if (path.extname(file) === '.mp3') {
        const flacIndex = flacFiles.indexOf(filePath);
        if (flacIndex > -1) {
          flacFiles.splice(flacIndex, 1);
          continue;
        }
        noFilesWereProcessed = false;
        await processTrack(filePath);
      }
      else if (path.extname(file) === '.flac') {
        noFilesWereProcessed = false;
        logger.info(`Converting flac to mp3: ${filePath}`);
        const result: ConverterResult = converter.flacToMp3(filePath);
        if (result.status === 0) {
          logger.info(`File ${filePath} was converted to mp3: ${result.outputPath}`);
          flacFiles.push(result.outputPath);
          await processTrack(result.outputPath);
        } else {
          logger.warn(`Converting file ${filePath} failed with code ${result.status} and message:\n${result.error?.message}:\nstderr: ${result.lameStderr}`);
        }
      }
    }
    if (noFilesWereProcessed) {
      logger.error(`There are no suitable files in directory: ${directory}`);
      process.exitCode = 1;
      return;
    }
  });
};

const processTrack = async trackPath => {
  const trackFilename = path.basename(trackPath);
  const trackFilenameWithourExtension = trackFilename.replace(new RegExp(`${path.extname(trackFilename)}$`), '');
  const trackFilenameKeywords = tools.splitTrackNameToKeywords(trackFilenameWithourExtension);
  console.log('########################################');
  logger.info(`Filename [${trackFilenameKeywords.length}]: ${trackFilename}`);
  // console.log(extractId3Tag(trackPath));
  const trackUrlFilename = path.join(path.dirname(trackPath), `${trackFilenameWithourExtension}.url`);
  let trackUrl;
  if (fs.existsSync(trackUrlFilename)) {
    trackUrl = tools.getUrlFromFile(trackUrlFilename);
    logger.info(`Using URL: ${trackUrl}`);
  } else {
    const bestMatchingTrack = await findBestMatchingTrack(trackFilenameKeywords);
    if (bestMatchingTrack.score < Math.max(2, trackFilenameKeywords.length)) {
      logger.warn(`Couldn't match any track, the higgest score was ${bestMatchingTrack.score} for track:\n${bestMatchingTrack.fullName}\nScore keywords: ${bestMatchingTrack.scoreKeywords}\nName  keywords: ${trackFilenameKeywords}`);
      return;
    }
    logger.info(`Matched  [${bestMatchingTrack.score}]: ${bestMatchingTrack.fullName}`);
    trackUrl = bestMatchingTrack.url;
  }
  const trackData = await extractTrackData(trackUrl);
  // await saveId3TagToFile(trackPath, trackData, { verbose: true });
  await saveId3TagToFile(trackPath, trackData);
}

const extractId3Tag = trackPath => {
  const displayPluginOutput = childProcess.spawnSync('eyeD3', [
    '--plugin', 'display',
    '--pattern-file', DISPLAY_PLUGIN_PATTERN_FILE,
    trackPath
  ], {
    encoding: 'utf-8',
  });
  if (displayPluginOutput.stderr) {
    logger.warn(`Cannot read ID3 tag of ${path.basename(trackPath)}:\n${tools.leaveOnlyFirstLine(displayPluginOutput.stderr)}`);  // show only first line of error from plugin (ommit traceback)
    return {};
  }
  // console.log(displayPluginOutput.stdout);
  let id3TagJson;
  try {
    id3TagJson = JSON.parse(displayPluginOutput.stdout
      .replace(//mgi, '')  // replace unicode characters that break parse() (e.g. Beatoprt's heart before links!)
      .replace(/,\s*\}/mgi, '}')  // remove trailing commas that comes from plugin pattern (text-fields)
    );
  } catch (error) {
    logger.warn(`Cannot parse ID3 tag output from display plugin: ${error}`);
    return {};
  }
  return id3TagJson;
};

interface MatchingTrack extends TrackInfo {
  score?: number,
  scoreKeywords?: Array<string>,
  fullName?: string,
}

const findBestMatchingTrack: (inputKeywords: Array<string>) => Promise<MatchingTrack> = async inputKeywords => {
  const searchDoc = await tools.fetchWebPage(SEARCH_URL + encodeURIComponent(inputKeywords.join('+')));

  let winner: MatchingTrack = {
    score: -1,
    released: '2999-12-12',  // some far away date...
  };
  const trackNodes = searchDoc.querySelectorAll('.bucket-item.ec-item.track');
  for (const trackNode of trackNodes) {
    const trackTitle = tools.createTitle(
      trackNode.querySelector('.buk-track-primary-title'),
      trackNode.querySelector('.buk-track-remixed')
    );
    const trackArtists = tools.createArtistsList(trackNode.querySelector('.buk-track-artists'), trackTitle);
    const trackRemixers = tools.createArtistsList(trackNode.querySelector('.buk-track-remixers'));
    let trackReleased = trackNode.querySelector('.buk-track-released');
    trackReleased = trackReleased && trackReleased.textContent;

    const trackKeywords = tools.splitTrackNameToKeywords([trackArtists, trackTitle]);
    // const trackKeywords = Array.from(new Set([
    //   ...trackTitle.split(/\s+/),
    //   ...trackRemixed.split(/\s+/),
    //   ...trackArtists.split(/[\s,]+/),
    //   ...trackRemixers.split(/[\s,]+/),
    // ]));

    const keywordsIntersection = tools.arrayIntersection(
      tools.arrayToLowerCase(inputKeywords),
      tools.replacePathForbiddenChars(tools.arrayToLowerCase(trackKeywords))
    );
    // console.log(`Track: ${trackArtists} - ${trackTitle} + (${trackRemixed})`);
    // console.log('Intersection:', keywordsIntersection);
    const score = keywordsIntersection.length;
    if ((score > winner.score) || ((score === winner.score) && (Date.parse(trackReleased) < Date.parse(winner.released)))) {
      winner = {
        // node: trackNode,
        score: score,
        scoreKeywords: keywordsIntersection,
        released: trackReleased,
        title: trackTitle,
        artists: trackArtists,
        remixers: trackRemixers,
        url: DOMAIN_URL + trackNode.querySelector('.buk-track-title a[href*="/track/"]').href,
      };
      // if (score === inputKeywords.length) break;  // winner has been found (but maybe not the earier release!)
    }
  }
  winner.fullName = `${winner.artists} - ${winner.title}`;
  return winner;
}


const extractTrackData: (trackUrl: string) => Promise<TrackInfo> = async trackUrl => {
  const trackDoc = await tools.fetchWebPage(trackUrl);
  const title = tools.createTitle(
    trackDoc.querySelector('.interior-title h1:not(.remixed)'),
    trackDoc.querySelector('.interior-title h1.remixed')
  );
  const remixers = tools.createArtistsList(trackDoc.querySelector('.interior-track-artists:nth-of-type(2) .value'));
  const artists = tools.createArtistsList(trackDoc.querySelector('.interior-track-artists .value'), title);
  const released = trackDoc.querySelector('.interior-track-content-item.interior-track-released .value').textContent.trim();
  const year = released.split('-')[0];
  const bpm = trackDoc.querySelector('.interior-track-content-item.interior-track-bpm .value').textContent.trim();
  const key = tools.createKey(trackDoc.querySelector('.interior-track-content-item.interior-track-key .value'));
  const genre = tools.createGenresList(trackDoc.querySelector('.interior-track-content-item.interior-track-genre'));

  const waveform = trackDoc.querySelector('#react-track-waveform.interior-track-waveform[data-src]').dataset.src;

  const trackUrlPathnameArray = url.parse(trackUrl, true).pathname.split('/');
  const trackId = trackUrlPathnameArray[trackUrlPathnameArray.length - 1];
  const trackUfid = `track-${trackId}`;

  // const publisher = trackDoc.querySelector('.interior-track-content-item.interior-track-labels .value').textContent.trim();
  const publisherUrl = DOMAIN_URL + trackDoc.querySelector('.interior-track-content-item.interior-track-labels .value a').href;
  const publisher = await extractPublisherData(publisherUrl);

  const albumUrl = DOMAIN_URL + trackDoc.querySelector('.interior-track-release-artwork-link[href*="/release/"]').href;
  const album = await extractAlbumData(albumUrl, trackId);

  return {
    url: trackUrl,
    artists,
    title,
    remixers,
    released,
    year,
    genre,
    bpm,
    key,
    ufid: trackUfid,
    waveform,
    publisher,
    album,
  };
};

const extractAlbumData: (albumUrl: string, trackId: string) => Promise<AlbumInfo> = async (albumUrl, trackId) => {
  const albumDoc = await tools.fetchWebPage(albumUrl);
  const artists = tools.createArtistsList(albumDoc.querySelector('.interior-release-chart-content .interior-release-chart-content-list .interior-release-chart-content-item .value'));
  const title = albumDoc.querySelector('.interior-release-chart-content h1').textContent;
  const catalogNumber = albumDoc.querySelector('.interior-release-chart-content-item--desktop .interior-release-chart-content-item:nth-of-type(3) .value').textContent;
  const trackNumber = albumDoc.querySelector(`.interior-release-chart-content .bucket-item.ec-item.track[data-ec-id="${trackId}"] .buk-track-num`).textContent;
  const trackTotal = albumDoc.querySelectorAll('.interior-release-chart-content .bucket-item.ec-item.track').length;
  const artwork = albumDoc.querySelector('.interior-release-chart-artwork-parent .interior-release-chart-artwork').src;
  return {
    artists,
    title,
    catalogNumber,
    trackNumber,
    trackTotal,
    url: albumUrl,
    artwork,
  };
};

const extractPublisherData: (publisherUrl: string) => Promise<PublisherInfo> = async publisherUrl => {
  const publisherDoc = await tools.fetchWebPage(publisherUrl);
  const name = publisherDoc.querySelector('.interior-top-container .interior-title h1').textContent.trim();
  const logotype = publisherDoc.querySelector('.interior-top-container .interior-top-artwork-parent img.interior-top-artwork').src;
  return {
    name,
    url: publisherUrl,
    logotype,
  };
};

interface TrackArtworkFiles {
  frontCover?: string, // TODO: File?
  waveform?: string,
  publisherLogotype?: string,
};

const saveId3TagToFile = async (trackPath, trackData, { id3v2 = true, id3v1 = true, verbose = false } = {}) => {
  const imagePaths: TrackArtworkFiles = {};
  await tools.downloadFile(trackData.publisher.logotype, null, filename => {
    if (verbose) {
      console.log(`Publisher logotype written to: ${filename}`);
    }
    imagePaths.publisherLogotype = filename;
  });
  await tools.downloadFile(trackData.album.artwork, null, filename => {
    if (verbose) {
      console.log(`Album artwork written to: ${filename}`);
    }
    imagePaths.frontCover = filename;
  });
  await tools.downloadFile(trackData.waveform, null, filename => {
    if (verbose) {
      console.log(`Waveform written to: ${filename}`);
    }
    imagePaths.waveform = filename;
  });

  const trackFilename = path.basename(trackPath);

  // const colonEscapeChar = (process.platform === "win32") ? '\\' : '\\\\';
  const colonEscapeChar = '\\'; // the same on linux platform...

  const eyeD3Options = [
    '--verbose',
    '--artist', trackData.artists,
    // '--artist', trackData.artists.replace('ø', 'o'),
    '--title', trackData.title,
    '--text-frame', `TPE4:${trackData.remixers}`,  // TPE4 => REMIXEDBY
    '--album', trackData.album.title,
    '--album-artist', trackData.album.artists,
    '--text-frame', `TRCK:${trackData.album.trackNumber}/${trackData.album.trackTotal}`,  // eyeD3 adds leading 0 when using --track & --track-total
    // '--track', trackData.album.trackNumber,
    // '--track-total', trackData.album.trackTotal,
    // '--no-zero-padding',  // there is no such option in eyeD3 anymore?
    // '--disc-num', '???',  // there is no disc information on beatport? (and other streaming like Amazon?)
    // '--disc-total', '???',
    // '--release-year', trackData.year,
    // '--text-frame', `TDRC:${trackData.year}`,
    '--text-frame', `TYER:${trackData.year}`,
    '--text-frame', `TORY:${trackData.released}`,
    '--text-frame', `TRDA:${trackData.released}`,
    '--text-frame', `TDAT:${trackData.released}`,
    '--text-frame', `TDRC:${trackData.released}`,
    '--text-frame', `TDOR:${trackData.released}`,
    '--text-frame', `TDRL:${trackData.released}`,
    // '--release-date', trackData.released,
    // '--orig-release-date', trackData.released,
    '--url-frame', `WOAF:${trackData.url.replace(':', `${colonEscapeChar}:`)}`,  // file webpage
    '--url-frame', `WPUB:${trackData.publisher.url.replace(':', `${colonEscapeChar}:`)}`,  // publisher webpage
    '--bpm', trackData.bpm,
    '--text-frame', `TKEY:${trackData.key}`, '--user-text-frame', `INITIALKEY:${trackData.key}`,  // TKEY is not recoginzed in foobar2000
    '--user-text-frame', `CATALOGNUMBER:${trackData.album.catalogNumber}`, '--user-text-frame', `CATALOG #:${trackData.album.catalogNumber}`,  // https://wiki.hydrogenaud.io/index.php?title=Tag_Mapping
    '--add-image', `${imagePaths.frontCover}:FRONT_COVER:Front Cover`,  // front cover
    '--add-image', `${imagePaths.waveform}:BRIGHT_COLORED_FISH:Waveform`,  // waveform
    '--add-image', `${imagePaths.publisherLogotype}:PUBLISHER_LOGO:Publisher Logotype`,  // publisher logo
    '--genre', trackData.genre,
    '--publisher', trackData.publisher.name, '--text-frame', `TIT1:${trackData.publisher.name}`,  // TIT1 => CONTENTGROUP
    // '--unique-file-id', `http${colonEscapeChar}://www.id3.org/dummy/ufid.html:${trackData.ufid}`,
    '--unique-file-id', `${DOMAIN_URL.replace(':', `${colonEscapeChar}:`)}:${trackData.ufid}`,
    '--remove-frame', 'PRIV', '--remove-all-comments',  // remove personal info: https://aaronk.me/removing-personal-information-from-mp3s-bought-off-amazon/
    '--text-frame', 'TAUT:',  // remove frame incompatible with v2.4
    '--preserve-file-times',  // do not update file modification times
    trackPath
  ];

  if (id3v2) {
    executeEyeD3Tool('2.4', eyeD3Options, trackFilename, verbose);
  }

  if (id3v1) {
    executeEyeD3Tool('1.1', eyeD3Options, trackFilename, verbose);
  }

  // Correct filename to match ID3 tag info:
  const correctedFilename = tools.replacePathForbiddenChars(`${trackData.artists} - ${trackData.title}${path.extname(trackPath)}`);
  fs.renameSync(trackPath, path.dirname(trackPath) + path.sep + correctedFilename);
  console.log(`File was renamed to: ${correctedFilename}`);
  // fs.rename(trackPath, path.dirname(trackPath) + path.sep + correctedFilename, (error) => {
  //   if (error) {
  //     console.error(`Couldn't rename ${trackFilename}`);
  //     return;
  //   }
  //   console.log(`File was renamed to: ${correctedFilename}`);
  // });

  fs.unlinkSync(imagePaths.frontCover);
  fs.unlinkSync(imagePaths.waveform);
  fs.unlinkSync(imagePaths.publisherLogotype);
}

const executeEyeD3Tool = (version, options, filename, verbose = false) => {
  if (!['1.0', '1.1', '2.3', '2.4'].includes(version)) {
    console.error(`Wrong version of ID3 tag was specified: ${version}`);
    return -1;
  }
  const child = childProcess.spawnSync('eyeD3', [
    '--v2',
    `--to-v${version}`,  // overwrite other versions of id3
    ...options,
  ], {
    encoding: 'utf8',
  });

  if (child.error) {
    logger.error(`ERROR: Failed to start child process: ${child.error}`);
  } else if (child.status !== 0) {
    logger.error(`ERROR: Child process (v${version}) exited with code ${child.status}:\n${tools.leaveOnlyFirstLine(child.stderr)}`);
  // } else if (child.stderr) {
  //   console.error(`Error occured when saving ID3v${version} tag:`);
  } else {
    console.log(verbose ? child.stdout : `ID3v${version} tag was saved to ${filename}`);
  }
};

processAllFilesInDirectory(tracksDirectory);
