import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { TrackInfo, AlbumInfo, PublisherInfo } from './types';
import {
  BearTunesTaggerOptions, MatchingTrack, TrackArtworkFiles, ID3Version,
} from './tagger.types';

// exporting types, so they will be included in the tagger import
export {
  BearTunesTaggerOptions, MatchingTrack, TrackArtworkFiles, ID3Version,
};

const logger = require('./logger');
const tools = require('./tools');

// const DOMAIN_URL = 'https://www.beatport.com';
// const SEARCH_URL = `${DOMAIN_URL}/search/tracks?per-page=150&q=`; // we want tracks only
// // const SEARCH_URL = `${DOMAIN_URL}/search/tracks?q=`; // we want tracks only
// // const SEARCH_URL = `${DOMAIN_URL}/search?q=`;
// const EYED3_DISPLAY_PLUGIN_PATTERN_FILE = 'eyed3-pattern.txt';

const defaultTaggerOptions: BearTunesTaggerOptions = {
  domainURL: 'https://www.beatport.com',
  get searchURL() { return `${this.domainURL}/search/tracks?per-page=150&q=`; }, // we want tracks only
  // get searchURL() { return `${this.domainURL}/search/tracks?q=`; }, // we want tracks only
  // get searchURL() { return `${this.domainURL}/search?q=`; }, // we want tracks only
  eyeD3DisplayPluginPatternFile: './eyed3-pattern.txt',
  verbose: false,
} as const;

export class BearTunesTagger {
  options: BearTunesTaggerOptions;

  constructor(options: Partial<BearTunesTaggerOptions> = {}) {
    this.options = defaultTaggerOptions;
    Object.assign(this.options, options);
  }

  async processTrack(trackPath: string): Promise<void> {
    const trackFilename = path.basename(trackPath);
    const trackFilenameWithoutExtension = trackFilename.replace(new RegExp(`${path.extname(trackFilename)}$`), '');
    const trackFilenameKeywords = tools.splitTrackNameToKeywords(trackFilenameWithoutExtension);
    logger.silly('########################################');
    logger.info(`Filename [${trackFilenameKeywords.length}]: ${trackFilename}`);
    // console.log(this.extractId3Tag(trackPath));
    const trackUrlFilename = path.join(path.dirname(trackPath), `${trackFilenameWithoutExtension}.url`);
    let trackUrl: URL | null;
    if (fs.existsSync(trackUrlFilename)) {
      trackUrl = tools.getUrlFromFile(trackUrlFilename);
      if (trackUrl === null) {
        logger.warn(`URL file is present but no URL found inside (skipping): ${trackUrlFilename}`);
        return;
      }
      logger.info(`Using URL from file: ${trackUrl}`);
    } else {
      const bestMatchingTrack = await this.findBestMatchingTrack(trackFilenameKeywords);
      if (bestMatchingTrack.score < Math.max(2, trackFilenameKeywords.length)) {
        let warnMessage = `Couldn't match any track, the higgest score was ${bestMatchingTrack.score} for track:\n${bestMatchingTrack.fullName}\n`;
        warnMessage += `Score keywords: ${bestMatchingTrack.scoreKeywords}\nName  keywords: ${trackFilenameKeywords}`;
        logger.warn(warnMessage);
        return;
      }
      logger.info(`Matched  [${bestMatchingTrack.score}]: ${bestMatchingTrack.fullName}`);
      trackUrl = bestMatchingTrack.url ?? null;
    }
    if (!trackUrl) return;
    const trackData = await this.extractTrackData(trackUrl);
    await this.saveId3TagToFile(trackPath, trackData);
  }

  extractId3Tag(trackPath: string): TrackInfo {
    const displayPluginOutput = childProcess.spawnSync('eyeD3', [
      '--plugin', 'display',
      '--pattern-file', this.options.eyeD3DisplayPluginPatternFile,
      trackPath,
    ], {
      encoding: 'utf-8',
    });
    if (displayPluginOutput.stderr) {
      logger.warn(`Cannot read ID3 tag of ${path.basename(trackPath)}:\n${tools.leaveOnlyFirstLine(displayPluginOutput.stderr)}`); // show only first line of error from plugin (ommit traceback)
      return {};
    }
    // console.log(displayPluginOutput.stdout);
    let id3TagJson: TrackInfo;
    try {
      id3TagJson = JSON.parse(displayPluginOutput.stdout
        // eslint-disable-next-line no-control-regex
        .replace(//mgi, '') // replace unicode characters that break parse() (e.g. Beatoprt's heart before links!)
        .replace(/,\s*\}/mgi, '}')); // remove trailing commas that comes from plugin pattern (text-fields)
    } catch (error) {
      logger.warn(`Cannot parse ID3 tag output from display plugin: ${error}`);
      return {};
    }
    return id3TagJson;
  }

  async findBestMatchingTrack(inputKeywords: string[]): Promise<MatchingTrack> {
    const searchDoc = await tools.fetchWebPage(this.options.searchURL + encodeURIComponent(inputKeywords.join('+')));

    const winner: MatchingTrack = {
      score: -1,
      scoreKeywords: [],
      released: '2999-12-12', // some far away date...
      // title: '',
      // artists: '',
      // remixers: '',
      // url: undefined,
      get fullName() { return `${this.artists} - ${this.title}`; },
    };

    const trackNodes = searchDoc.querySelectorAll('.bucket-item.ec-item.track');
    for (const trackNode of trackNodes) {
      const trackTitle = tools.createTitle(
        trackNode.querySelector('.buk-track-primary-title'),
        trackNode.querySelector('.buk-track-remixed'),
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
        tools.replacePathForbiddenChars(tools.arrayToLowerCase(trackKeywords)),
      );
      // console.log(`Track: ${trackArtists} - ${trackTitle} + (${trackRemixed})`);
      // console.log('Intersection:', keywordsIntersection);
      const score = keywordsIntersection.length;
      if ((score > winner.score) || ((score === winner.score) && (Date.parse(trackReleased) < Date.parse(winner.released ?? '')))) {
        // winner.node = trackNode;
        winner.score = score;
        winner.scoreKeywords = keywordsIntersection;
        winner.released = trackReleased;
        winner.title = trackTitle;
        winner.artists = trackArtists;
        winner.remixers = trackRemixers;
        winner.url = new URL(this.options.domainURL + trackNode.querySelector('.buk-track-title a[href*="/track/"]').href);
        // if (score === inputKeywords.length) break;  // winner has been found (but maybe not the earier release!)
      }
    }
    return winner;
  }

  async extractTrackData(trackUrl: URL): Promise<TrackInfo> {
    const trackDoc = await tools.fetchWebPage(trackUrl);
    const title = tools.createTitle(
      trackDoc.querySelector('.interior-title h1:not(.remixed)'),
      trackDoc.querySelector('.interior-title h1.remixed'),
    );
    const remixers = tools.createArtistsList(trackDoc.querySelector('.interior-track-artists:nth-of-type(2) .value'));
    const artists = tools.createArtistsList(trackDoc.querySelector('.interior-track-artists .value'), title);
    const released = trackDoc.querySelector('.interior-track-content-item.interior-track-released .value').textContent.trim();
    const year = tools.getPositiveIntegerOrUndefined(released.match(/\d{4}/));
    const bpm = tools.getPositiveIntegerOrUndefined(trackDoc.querySelector('.interior-track-content-item.interior-track-bpm .value').textContent.trim());
    const key = tools.createKey(trackDoc.querySelector('.interior-track-content-item.interior-track-key .value'));
    const genre = tools.createGenresList(trackDoc.querySelector('.interior-track-content-item.interior-track-genre'));

    const waveform = new URL(trackDoc.querySelector('#react-track-waveform.interior-track-waveform[data-src]').dataset.src);

    const trackUrlPathnameArray = trackUrl.pathname.split('/');
    const trackId = trackUrlPathnameArray[trackUrlPathnameArray.length - 1];
    const trackUfid = `track-${trackId}`;

    // const publisher = trackDoc.querySelector('.interior-track-content-item.interior-track-labels .value').textContent.trim();
    const publisherUrl = new URL(this.options.domainURL + trackDoc.querySelector('.interior-track-content-item.interior-track-labels .value a').href);
    const publisher = await BearTunesTagger.extractPublisherData(publisherUrl);

    const albumUrl = new URL(this.options.domainURL + trackDoc.querySelector('.interior-track-release-artwork-link[href*="/release/"]').href);
    const album = await BearTunesTagger.extractAlbumData(albumUrl, trackId);

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
  }

  static async extractAlbumData(albumUrl: URL, trackId: string): Promise<AlbumInfo> {
    const albumDoc = await tools.fetchWebPage(albumUrl);
    const artists = tools.createArtistsList(albumDoc.querySelector('.interior-release-chart-content .interior-release-chart-content-list .interior-release-chart-content-item .value'));
    const title = albumDoc.querySelector('.interior-release-chart-content h1').textContent;
    const catalogNumber = albumDoc.querySelector('.interior-release-chart-content-item--desktop .interior-release-chart-content-item:nth-of-type(3) .value').textContent;
    const trackNumber = tools.getPositiveIntegerOrUndefined(albumDoc.querySelector(`.interior-release-chart-content .bucket-item.ec-item.track[data-ec-id="${trackId}"] .buk-track-num`).textContent);
    const trackTotal = tools.getPositiveIntegerOrUndefined(albumDoc.querySelectorAll('.interior-release-chart-content .bucket-item.ec-item.track').length);
    const artwork = new URL(albumDoc.querySelector('.interior-release-chart-artwork-parent .interior-release-chart-artwork').src);
    return {
      artists,
      title,
      catalogNumber,
      trackNumber,
      trackTotal,
      url: albumUrl,
      artwork,
    };
  }

  static async extractPublisherData(publisherUrl: URL): Promise<PublisherInfo> {
    const publisherDoc = await tools.fetchWebPage(publisherUrl);
    const name = publisherDoc.querySelector('.interior-top-container .interior-title h1').textContent.trim();
    const logotype = new URL(publisherDoc.querySelector('.interior-top-container .interior-top-artwork-parent img.interior-top-artwork').src);
    return {
      name,
      url: publisherUrl,
      logotype,
    };
  }

  async saveId3TagToFile(trackPath: string, trackData: TrackInfo, { id3v2 = true, id3v1 = true, verbose = false } = {}) {
    const imagePaths: TrackArtworkFiles = {};
    await tools.downloadFile(trackData.publisher?.logotype, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Publisher logotype written to: ${filename}`);
      }
      imagePaths.publisherLogotype = filename;
    });
    await tools.downloadFile(trackData.album?.artwork, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Album artwork written to: ${filename}`);
      }
      imagePaths.frontCover = filename;
    });
    await tools.downloadFile(trackData.waveform, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Waveform written to: ${filename}`);
      }
      imagePaths.waveform = filename;
    });

    const trackFilename = path.basename(trackPath);

    // const colonEscapeChar = (process.platform === "win32") ? '\\' : '\\\\';
    const colonEscapeChar = '\\'; // the same on windows & linux platform...

    const eyeD3Options: string[] = [
      '--verbose',
      '--remove-frame', 'PRIV', '--remove-all-comments', // remove personal info: https://aaronk.me/removing-personal-information-from-mp3s-bought-off-amazon/
      '--text-frame', 'TAUT:', // remove frame incompatible with v2.4
      '--preserve-file-times', // do not update file modification times
    ];

    if (trackData.artists) {
      eyeD3Options.push('--artist', trackData.artists);
      // '--artist', trackData.artists.replace('ø', 'o'),
    }
    if (trackData.title) {
      eyeD3Options.push('--title', trackData.title);
    }
    if (trackData.remixers) {
      eyeD3Options.push('--text-frame', `TPE4:${trackData.remixers}`); // TPE4 => REMIXEDBY
    }
    if (trackData.album?.title) {
      eyeD3Options.push('--album', trackData.album.title);
    }
    if (trackData.album?.artists) {
      eyeD3Options.push('--album-artist', trackData.album.artists);
    }
    if (trackData.album?.trackNumber) {
      let albumNumbers = trackData.album.trackNumber.toString();
      if (trackData.album?.trackTotal) {
        albumNumbers += `/${trackData.album.trackTotal.toString()}`;
      }
      eyeD3Options.push('--text-frame', `TRCK:${albumNumbers}`); // eyeD3 adds leading 0 when using --track & --track-total
      // '--track', trackData.album.trackNumber,
      // '--track-total', trackData.album.trackTotal,
      // '--no-zero-padding',  // there is no such option in eyeD3 anymore?
      // '--disc-num', '???',  // there is no disc information on beatport? (and other streaming like Amazon?)
      // '--disc-total', '???',
    }
    if (trackData.year) {
      // '--release-year', trackData.year,
      // '--text-frame', `TDRC:${trackData.year}`,
      eyeD3Options.push('--text-frame', `TYER:${trackData.year}`);
    }
    if (trackData.released) {
      eyeD3Options.push('--text-frame', `TORY:${trackData.released}`);
      eyeD3Options.push('--text-frame', `TRDA:${trackData.released}`);
      eyeD3Options.push('--text-frame', `TDAT:${trackData.released}`);
      eyeD3Options.push('--text-frame', `TDRC:${trackData.released}`);
      eyeD3Options.push('--text-frame', `TDOR:${trackData.released}`);
      eyeD3Options.push('--text-frame', `TDRL:${trackData.released}`);
      // '--release-date', trackData.released,
      // '--orig-release-date', trackData.released,
    }
    if (trackData.url) {
      eyeD3Options.push('--url-frame', `WOAF:${trackData.url.toString().replace(':', `${colonEscapeChar}:`)}`); // file webpage
    }
    if (trackData.publisher?.url) {
      eyeD3Options.push('--url-frame', `WPUB:${trackData.publisher.url.toString().replace(':', `${colonEscapeChar}:`)}`); // publisher webpage
    }
    if (trackData.bpm) {
      eyeD3Options.push('--bpm', trackData.bpm.toString());
    }
    if (trackData.key) {
      eyeD3Options.push('--text-frame', `TKEY:${trackData.key}`);
      eyeD3Options.push('--user-text-frame', `INITIALKEY:${trackData.key}`); // TKEY is not recoginzed in foobar2000
    }
    if (trackData.album?.catalogNumber) {
      // https://wiki.hydrogenaud.io/index.php?title=Tag_Mapping
      eyeD3Options.push('--user-text-frame', `CATALOGNUMBER:${trackData.album.catalogNumber}`);
      eyeD3Options.push('--user-text-frame', `CATALOG #:${trackData.album.catalogNumber}`);
    }
    if (imagePaths.frontCover) {
      eyeD3Options.push('--add-image', `${imagePaths.frontCover}:FRONT_COVER:Front Cover`); // front cover
    }
    if (imagePaths.waveform) {
      eyeD3Options.push('--add-image', `${imagePaths.waveform}:BRIGHT_COLORED_FISH:Waveform`); // waveform
    }
    if (imagePaths.publisherLogotype) {
      eyeD3Options.push('--add-image', `${imagePaths.publisherLogotype}:PUBLISHER_LOGO:Publisher Logotype`); // publisher logo
    }
    if (trackData.genre) {
      eyeD3Options.push('--genre', trackData.genre);
    }
    if (trackData.publisher?.name) {
      eyeD3Options.push('--publisher', trackData.publisher.name);
      eyeD3Options.push('--text-frame', `TIT1:${trackData.publisher.name}`); // TIT1 => CONTENTGROUP
    }
    if (trackData.ufid) {
      // '--unique-file-id', `http${colonEscapeChar}://www.id3.org/dummy/ufid.html:${trackData.ufid}`,
      eyeD3Options.push('--unique-file-id', `${this.options.domainURL.replace(':', `${colonEscapeChar}:`)}:${trackData.ufid}`);
    }

    eyeD3Options.push(trackPath);

    if (id3v2) {
      BearTunesTagger.executeEyeD3Tool(ID3Version.ID3v2_4, eyeD3Options, trackFilename, this.options.verbose);
    }

    if (id3v1) {
      BearTunesTagger.executeEyeD3Tool(ID3Version.ID3v1_1, eyeD3Options, trackFilename, this.options.verbose);
    }

    // Correct filename to match ID3 tag info:
    const correctedFilename = tools.replacePathForbiddenChars(`${trackData.artists} - ${trackData.title}${path.extname(trackPath)}`);
    fs.renameSync(trackPath, path.dirname(trackPath) + path.sep + correctedFilename);
    logger.info(`File was renamed to: ${correctedFilename}`);
    // fs.rename(trackPath, path.dirname(trackPath) + path.sep + correctedFilename, (error) => {
    //   if (error) {
    //     console.error(`Couldn't rename ${trackFilename}`);
    //     return;
    //   }
    //   console.log(`File was renamed to: ${correctedFilename}`);
    // });

    Object.values(imagePaths).forEach((imagePath) => path && fs.unlinkSync(imagePath));
  }

  static executeEyeD3Tool(version: ID3Version, options: string[], filename: string, verbose: boolean = false) {
    // if (!['1.0', '1.1', '2.3', '2.4'].includes(version)) {
    //   logger.error(`Wrong version of ID3 tag was specified: ${version}`);
    //   return -1;
    // }
    const child = childProcess.spawnSync('eyeD3', [
      '--v2',
      `--to-v${version.toString()}`, // overwrite other versions of id3
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
      logger.info(verbose ? child.stdout : `ID3v${version} tag was saved to ${filename}`);
    }

    return 0;
  }
}
