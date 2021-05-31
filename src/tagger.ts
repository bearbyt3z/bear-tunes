import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

import { TrackInfo, AlbumInfo, PublisherInfo } from './types';
import { TaggerOptions, MatchingTrack, TrackArtworkFiles } from './tagger.types';

// exporting types, so they will be included in the converter import
export { TaggerOptions, MatchingTrack, TrackArtworkFiles };

const logger = require('./logger');
const tools = require('./tools');

// const DOMAIN_URL = 'https://www.beatport.com';
// const SEARCH_URL = `${DOMAIN_URL}/search/tracks?per-page=150&q=`; // we want tracks only
// // const SEARCH_URL = `${DOMAIN_URL}/search/tracks?q=`; // we want tracks only
// // const SEARCH_URL = `${DOMAIN_URL}/search?q=`;
// const EYED3_DISPLAY_PLUGIN_PATTERN_FILE = 'eyed3-pattern.txt';

const defaultTaggerOptions: TaggerOptions = {
  domainURL: 'https://www.beatport.com',
  get searchURL() { return `${this.domainURL}/search/tracks?per-page=150&q=`; }, // we want tracks only
  // get searchURL() { return `${this.domainURL}/search/tracks?q=`; }, // we want tracks only
  // get searchURL() { return `${this.domainURL}/search?q=`; }, // we want tracks only
  eyed3DisplayPluginPatternFile: './eyed3-pattern.txt',
  verbose: false,
};

export class BearTunesTagger {
  taggerOptions: TaggerOptions;

  constructor(options: TaggerOptions = {}) {
    this.taggerOptions = Object.assign(options, defaultTaggerOptions);
  }

  async processTrack(trackPath: string) {
    const trackFilename = path.basename(trackPath);
    const trackFilenameWithoutExtension = trackFilename.replace(new RegExp(`${path.extname(trackFilename)}$`), '');
    const trackFilenameKeywords = tools.splitTrackNameToKeywords(trackFilenameWithoutExtension);
    logger.silly('########################################');
    logger.info(`Filename [${trackFilenameKeywords.length}]: ${trackFilename}`);
    // console.log(this.extractId3Tag(trackPath));
    const trackUrlFilename = path.join(path.dirname(trackPath), `${trackFilenameWithoutExtension}.url`);
    let trackUrl: string;
    if (fs.existsSync(trackUrlFilename)) {
      trackUrl = tools.getUrlFromFile(trackUrlFilename);
      logger.info(`Using URL: ${trackUrl}`);
    } else {
      const bestMatchingTrack = await this.findBestMatchingTrack(trackFilenameKeywords);
      if (bestMatchingTrack.score < Math.max(2, trackFilenameKeywords.length)) {
        let warnMessage = `Couldn't match any track, the higgest score was ${bestMatchingTrack.score} for track:\n${bestMatchingTrack.fullName}\n`;
        warnMessage += `Score keywords: ${bestMatchingTrack.scoreKeywords}\nName  keywords: ${trackFilenameKeywords}`;
        logger.warn(warnMessage);
        return;
      }
      logger.info(`Matched  [${bestMatchingTrack.score}]: ${bestMatchingTrack.fullName}`);
      trackUrl = bestMatchingTrack.url;
    }
    const trackData = await this.extractTrackData(trackUrl);
    // await this.saveId3TagToFile(trackPath, trackData, { verbose: true });
    await this.saveId3TagToFile(trackPath, trackData);
  }

  extractId3Tag(trackPath: string) {
    const displayPluginOutput = childProcess.spawnSync('eyeD3', [
      '--plugin', 'display',
      '--pattern-file', this.taggerOptions.eyed3DisplayPluginPatternFile,
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

  async findBestMatchingTrack(inputKeywords: Array<string>): Promise<MatchingTrack> {
    const searchDoc = await tools.fetchWebPage(this.taggerOptions.searchURL + encodeURIComponent(inputKeywords.join('+')));

    let winner: MatchingTrack = {
      score: -1,
      released: '2999-12-12', // some far away date...
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
      if ((score > winner.score) || ((score === winner.score) && (Date.parse(trackReleased) < Date.parse(winner.released)))) {
        winner = {
          // node: trackNode,
          score,
          scoreKeywords: keywordsIntersection,
          released: trackReleased,
          title: trackTitle,
          artists: trackArtists,
          remixers: trackRemixers,
          url: this.taggerOptions.domainURL + trackNode.querySelector('.buk-track-title a[href*="/track/"]').href,
        };
        // if (score === inputKeywords.length) break;  // winner has been found (but maybe not the earier release!)
      }
    }
    winner.fullName = `${winner.artists} - ${winner.title}`;
    return winner;
  }

  async extractTrackData(trackUrl: string): Promise<TrackInfo> {
    const trackDoc = await tools.fetchWebPage(trackUrl);
    const title = tools.createTitle(
      trackDoc.querySelector('.interior-title h1:not(.remixed)'),
      trackDoc.querySelector('.interior-title h1.remixed'),
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
    const publisherUrl = this.taggerOptions.domainURL + trackDoc.querySelector('.interior-track-content-item.interior-track-labels .value a').href;
    const publisher = await BearTunesTagger.extractPublisherData(publisherUrl);

    const albumUrl = this.taggerOptions.domainURL + trackDoc.querySelector('.interior-track-release-artwork-link[href*="/release/"]').href;
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

  static async extractAlbumData(albumUrl: string, trackId: string): Promise<AlbumInfo> {
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
  }

  static async extractPublisherData(publisherUrl: string): Promise<PublisherInfo> {
    const publisherDoc = await tools.fetchWebPage(publisherUrl);
    const name = publisherDoc.querySelector('.interior-top-container .interior-title h1').textContent.trim();
    const logotype = publisherDoc.querySelector('.interior-top-container .interior-top-artwork-parent img.interior-top-artwork').src;
    return {
      name,
      url: publisherUrl,
      logotype,
    };
  }

  async saveId3TagToFile(trackPath, trackData, { id3v2 = true, id3v1 = true, verbose = false } = {}) {
    const imagePaths: TrackArtworkFiles = {};
    await tools.downloadFile(trackData.publisher.logotype, null, (filename) => {
      if (verbose) {
        logger.debug(`Publisher logotype written to: ${filename}`);
      }
      imagePaths.publisherLogotype = filename;
    });
    await tools.downloadFile(trackData.album.artwork, null, (filename) => {
      if (verbose) {
        logger.debug(`Album artwork written to: ${filename}`);
      }
      imagePaths.frontCover = filename;
    });
    await tools.downloadFile(trackData.waveform, null, (filename) => {
      if (verbose) {
        logger.debug(`Waveform written to: ${filename}`);
      }
      imagePaths.waveform = filename;
    });

    const trackFilename = path.basename(trackPath);

    // const colonEscapeChar = (process.platform === "win32") ? '\\' : '\\\\';
    const colonEscapeChar = '\\'; // the same on windows & linux platform...

    const eyeD3Options = [
      '--verbose',
      '--artist', trackData.artists,
      // '--artist', trackData.artists.replace('ø', 'o'),
      '--title', trackData.title,
      '--text-frame', `TPE4:${trackData.remixers}`, // TPE4 => REMIXEDBY
      '--album', trackData.album.title,
      '--album-artist', trackData.album.artists,
      '--text-frame', `TRCK:${trackData.album.trackNumber}/${trackData.album.trackTotal}`, // eyeD3 adds leading 0 when using --track & --track-total
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
      '--url-frame', `WOAF:${trackData.url.replace(':', `${colonEscapeChar}:`)}`, // file webpage
      '--url-frame', `WPUB:${trackData.publisher.url.replace(':', `${colonEscapeChar}:`)}`, // publisher webpage
      '--bpm', trackData.bpm,
      '--text-frame', `TKEY:${trackData.key}`, '--user-text-frame', `INITIALKEY:${trackData.key}`, // TKEY is not recoginzed in foobar2000
      '--user-text-frame', `CATALOGNUMBER:${trackData.album.catalogNumber}`, '--user-text-frame', `CATALOG #:${trackData.album.catalogNumber}`, // https://wiki.hydrogenaud.io/index.php?title=Tag_Mapping
      '--add-image', `${imagePaths.frontCover}:FRONT_COVER:Front Cover`, // front cover
      '--add-image', `${imagePaths.waveform}:BRIGHT_COLORED_FISH:Waveform`, // waveform
      '--add-image', `${imagePaths.publisherLogotype}:PUBLISHER_LOGO:Publisher Logotype`, // publisher logo
      '--genre', trackData.genre,
      '--publisher', trackData.publisher.name, '--text-frame', `TIT1:${trackData.publisher.name}`, // TIT1 => CONTENTGROUP
      // '--unique-file-id', `http${colonEscapeChar}://www.id3.org/dummy/ufid.html:${trackData.ufid}`,
      '--unique-file-id', `${this.taggerOptions.domainURL.replace(':', `${colonEscapeChar}:`)}:${trackData.ufid}`,
      '--remove-frame', 'PRIV', '--remove-all-comments', // remove personal info: https://aaronk.me/removing-personal-information-from-mp3s-bought-off-amazon/
      '--text-frame', 'TAUT:', // remove frame incompatible with v2.4
      '--preserve-file-times', // do not update file modification times
      trackPath,
    ];

    if (id3v2) {
      BearTunesTagger.executeEyeD3Tool('2.4', eyeD3Options, trackFilename, this.taggerOptions.verbose);
    }

    if (id3v1) {
      BearTunesTagger.executeEyeD3Tool('1.1', eyeD3Options, trackFilename, this.taggerOptions.verbose);
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

    fs.unlinkSync(imagePaths.frontCover);
    fs.unlinkSync(imagePaths.waveform);
    fs.unlinkSync(imagePaths.publisherLogotype);
  }

  static executeEyeD3Tool(version, options, filename, verbose = false) {
    if (!['1.0', '1.1', '2.3', '2.4'].includes(version)) {
      logger.error(`Wrong version of ID3 tag was specified: ${version}`);
      return -1;
    }
    const child = childProcess.spawnSync('eyeD3', [
      '--v2',
      `--to-v${version}`, // overwrite other versions of id3
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
