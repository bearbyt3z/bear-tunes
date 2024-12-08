import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const prompt = require('prompt-sync')({ sigint: true });

import { TrackInfo, AlbumInfo, PublisherInfo } from './types';
import {
  BearTunesTaggerOptions, MatchingTrack, TrackArtworkFiles, ID3Version,
  BeatportSearchResultArtistType, BeatportSearchResultArtistInfo, BeatportSearchResultTrackInfo, BeatportSearchResultGenreInfo,
  BeatportArtistInfo, BeatportTrackInfo, BeatportAlbumInfo, BeatportPublisherInfo,
} from './tagger.types';

// exporting types, so they will be included in the tagger import
export {
  BearTunesTaggerOptions, MatchingTrack, TrackArtworkFiles, ID3Version,
  BeatportSearchResultArtistType, BeatportSearchResultArtistInfo, BeatportSearchResultTrackInfo, BeatportSearchResultGenreInfo,
  BeatportArtistInfo, BeatportTrackInfo, BeatportAlbumInfo, BeatportPublisherInfo,
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
  get searchURL() { return `${this.domainURL}/search/tracks?per_page=150&q=`; }, // we want tracks only
  // get searchURL() { return `${this.domainURL}/search/tracks?q=`; }, // we want tracks only
  // get searchURL() { return `${this.domainURL}/search?q=`; }, // we want tracks only
  eyeD3DisplayPluginPatternFile: './eyed3-pattern.txt',
  lengthDifferenceAccepted: 3,
  verbose: false,
} as const;

export class BearTunesTagger {
  options: BearTunesTaggerOptions;

  constructor(options: Partial<BearTunesTaggerOptions> = {}) {
    this.options = defaultTaggerOptions;
    Object.assign(this.options, options);
  }

  async processTrack(trackPath: string): Promise<TrackInfo> {
    let forceRadioEdit = false;

    const trackFilename = path.basename(trackPath);
    const trackFilenameWithoutExtension = tools.replaceFilenameExtension(trackFilename, '');
    const trackFilenameKeywords = tools.splitTrackNameIntoKeywords(trackFilenameWithoutExtension);
    logger.silly('########################################');
    logger.info(`Filename [${trackFilenameKeywords.length}]: ${trackFilename}`);
    const trackUrlFilename = path.join(path.dirname(trackPath), `${trackFilenameWithoutExtension}.url`);
    let trackUrl: URL | null;
    if (fs.existsSync(trackUrlFilename)) {
      trackUrl = tools.getUrlFromFile(trackUrlFilename);
      if (trackUrl === null) {
        logger.warn(`URL file is present but no URL found inside (skipping): ${trackUrlFilename}`);
        return {};
      }
      logger.info(`Using URL from file: ${trackUrl}`);
    } else {
      const trackInfo = this.extractId3Tag(trackPath);
      const bestMatchingTrack = await this.findBestMatchingTrack(trackInfo, trackFilenameKeywords);
      trackUrl = bestMatchingTrack.url ?? null;
      if (bestMatchingTrack.score < Math.max(2, trackFilenameKeywords.length)) {
        let warnMessage = `Couldn't match any track, the higgest score was ${bestMatchingTrack.score} for track:\n${bestMatchingTrack.fullName}\n`;
        warnMessage += `Score keywords: ${bestMatchingTrack.scoreKeywords}\nName  keywords: ${trackFilenameKeywords}`;
        if (trackUrl) warnMessage += `\nURL: ${trackUrl}`;
        logger.warn(warnMessage);

        const proceedWithFound = prompt('Proceed with the found track? (y/n) ');
        if (proceedWithFound !== 'y' && proceedWithFound !== 'yes') {
          return {};
        }
      }
      logger.info(`Matched  [${bestMatchingTrack.score}]: ${bestMatchingTrack.fullName}`);

      if (trackInfo.details && bestMatchingTrack.details && Math.abs(bestMatchingTrack.details.duration - trackInfo.details.duration) > this.options.lengthDifferenceAccepted) {
        logger.warn(`Matched track has different duration: ${tools.secondsToTimeFormat(bestMatchingTrack.details.duration)} vs. ${tools.secondsToTimeFormat(trackInfo.details.duration)} (original)\nURL: ${trackUrl}`);

        const changeToRadioEdit = prompt('Change it to "Radio Edit"? (y)es/(n)o/(s)kip: ');
        if (changeToRadioEdit === 's' || changeToRadioEdit === 'skip') {
          return {};
        }

        forceRadioEdit = (changeToRadioEdit === 'y') || (changeToRadioEdit === 'yes');
      }
    }
    if (!trackUrl) {
      logger.error('URL of the matching track not found.');
      return {};
    }
    const trackInfo = await this.extractTrackData(trackUrl, forceRadioEdit);
    await this.saveId3TagToMp3File(trackPath, trackInfo);
    return trackInfo;
  }

  // Unfortunately display plugin is not available anymore in eyeD3 v0.9.7: https://github.com/nicfit/eyeD3/pull/585
  // This is mentioned also in history file: https://github.com/nicfit/eyeD3/blob/6ae155405770afbc1446432e71782d761218baa4/HISTORY.rst
  // "Changes: Removed display-plugin due to Grako EOL (#585)"
  extractId3Tag(trackPath: string): TrackInfo {
    // const displayPluginOutput = childProcess.spawnSync('eyeD3', [
    //   '--plugin', 'display',
    //   '--pattern-file', this.options.eyeD3DisplayPluginPatternFile,
    //   trackPath,
    // ], {
    //   encoding: 'utf-8',
    // });
    
    // Replacing eyeD3 display-plugin with a simple python script:
    const displayPluginOutput = childProcess.spawnSync('./eyed3-display-plugin.py', [
      this.options.eyeD3DisplayPluginPatternFile,
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

  static async extractNextJSData(url: URL): Promise<BeatportTrackInfo | BeatportAlbumInfo | BeatportPublisherInfo | BeatportSearchResultTrackInfo[]> {
    const doc = await tools.fetchWebPage(url);

    const nextJSElement = doc.querySelector('#__NEXT_DATA__'); // Next.js object containing element
    const nextJSText = nextJSElement?.textContent; // Next.js object text

    if (!nextJSText) throw new TypeError('Cannot obtain Next.js object.');

    let data;
    try {
      data = JSON.parse(nextJSText);
    } catch(error) {
      throw new TypeError(`Cannot parse Next.js object: ${error}`);
    }

    const stateData = data?.props?.pageProps?.dehydratedState?.queries[0]?.state?.data;

    if (!stateData) throw new TypeError('Cannot unpack state data from Next.js object.');

    return ('data' in stateData && stateData.data instanceof Array) ? stateData.data : stateData;
  }

  async findBestMatchingTrack(trackInfo: TrackInfo, inputKeywords: string[]): Promise<MatchingTrack> {
    const trackArray = await BearTunesTagger.extractNextJSData(new URL(this.options.searchURL + encodeURIComponent(inputKeywords.join('+')))) as BeatportSearchResultTrackInfo[];

    const winner: MatchingTrack = {
      details: {
        duration: 0,
      },
      score: -1,
      scoreKeywords: [],
      // released: new Date('2999-12-12'), // some far away date...
      // title: '',
      // artists: '',
      // remixers: '',
      // url: undefined,
      get fullName() { return `${this.artists?.join(', ')} - ${this.title}`; },
    };

    for (const trackEntry of trackArray) {
      const trackTitle = tools.createTitle(trackEntry.track_name, trackEntry.mix_name);

      const trackArtists = tools.createArtistArray(trackEntry.artists
        .filter((x: BeatportSearchResultArtistInfo) => x.artist_type_name === BeatportSearchResultArtistType.Artist)
        .map((x: BeatportSearchResultArtistInfo) => x.artist_name)
      );

      const trackRemixers = tools.createArtistArray(trackEntry.artists
        .filter((x: BeatportSearchResultArtistInfo) => x.artist_type_name === BeatportSearchResultArtistType.Remixer)
        .map((x: BeatportSearchResultArtistInfo) => x.artist_name)
      );

      const trackReleased = new Date(trackEntry.release_date);

      const trackKeywords = tools.splitTrackNameIntoKeywords([trackArtists.join(' '), trackTitle]);
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

      const score = keywordsIntersection.length;
      const trackLength = tools.roundToDecimalPlaces(trackEntry.length / 1000.0, 2);

      if ((score > winner.score)
        || ((score === winner.score) && (!winner.released || trackReleased < winner.released))
        || ((score === winner.score) && trackLength > 0 && trackInfo.details && Math.abs(trackLength - trackInfo.details.duration) < Math.abs(winner.details!.duration - trackInfo.details.duration))) {
        winner.details!.duration = trackLength; // the initialization of the winner variable (at the beginning) ensures that details prop is defined
        winner.score = score;
        winner.scoreKeywords = keywordsIntersection;
        winner.released = trackReleased;
        winner.title = trackTitle;
        winner.artists = trackArtists;
        winner.remixers = trackRemixers;
        winner.url = new URL(`${this.options.domainURL}/track/${tools.slugify(trackEntry.track_name)}/${trackEntry.track_id}`);

        // if (score === inputKeywords.length) break;  // winner has been found (but maybe not the earliest release!)
      }
    }

    return winner;
  }

  async extractTrackData(trackUrl: URL, forceRadioEdit: boolean): Promise<TrackInfo> {
    const trackData = await BearTunesTagger.extractNextJSData(trackUrl) as BeatportTrackInfo;

    let title = tools.createTitle(trackData.name, trackData.mix_name);

    if (forceRadioEdit) {
      const match = title.match(/Original Mix|Extended Mix/i);
      if (match != null && match.length >= 1) {
        title = title.replace(match[0], 'Radio Edit');
      } else {
        title += ' (Radio Edit)';
      }
    }

    const artists = tools.createArtistArray(trackData.artists.map((x: BeatportArtistInfo) => x.name));
    const remixers = tools.createArtistArray(trackData.remixers.map((x: BeatportArtistInfo) => x.name));

    const released = new Date(trackData.new_release_date); // or publish_date???
    const year = tools.getPositiveIntegerOrUndefined(released.getFullYear());

    const bpm = tools.getPositiveIntegerOrUndefined(trackData.bpm);
    const key = trackData.key && tools.createKeyTag(trackData.key.name) || undefined;
    const genre = trackData.genre && tools.createGenreTag(trackData.genre.name, trackData.sub_genre) || undefined;

    const duration = tools.roundToDecimalPlaces(trackData.length_ms / 1000.0, 2);

    const waveform = trackData.image && new URL(trackData.image.uri) || undefined;

    const isrc = trackData.isrc;
    const trackUfid = `track-${trackData.id}`;

    const publisherUrl = trackData.release?.label && new URL(`${this.options.domainURL}/label/${trackData.release.label.slug}/${trackData.release.label.id}`) || undefined;
    const publisher = publisherUrl && await BearTunesTagger.extractPublisherData(publisherUrl) || undefined;

    const albumUrl = trackData.release && new URL(`${this.options.domainURL}/release/${trackData.release.slug}/${trackData.release.id}`) || undefined;
    const album = albumUrl && await BearTunesTagger.extractAlbumData(albumUrl, trackData.number) || undefined;

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
      isrc,
      ufid: trackUfid,
      waveform,
      publisher,
      album,
      details: {
        duration,
      },
    };
  }

  static async extractAlbumData(albumUrl: URL, trackNumber: number): Promise<AlbumInfo> {
    const albumData = await BearTunesTagger.extractNextJSData(albumUrl) as BeatportAlbumInfo;

    const artists = tools.createArtistArray(albumData.artists.map((x: BeatportArtistInfo) => x.name));
    const title = tools.replaceTagForbiddenChars(albumData.name);
    const catalogNumber = albumData.catalog_number;
    const trackTotal = tools.getPositiveIntegerOrUndefined(albumData.track_count);
    const artwork = albumData.image && new URL(albumData.image.uri) || undefined;

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
    const publisherData = await BearTunesTagger.extractNextJSData(publisherUrl) as BeatportPublisherInfo;

    const name = publisherData.name;
    const logotype = publisherData.image && new URL(publisherData.image.uri) || undefined;

    return {
      name,
      url: publisherUrl,
      logotype,
    };
  }

  async saveId3TagToMp3File(trackPath: string, trackData: TrackInfo, { id3v2 = true, id3v1 = true, verbose = false } = {}): Promise<void> {
    const imagePaths: TrackArtworkFiles = {};
    await tools.downloadFile(trackData.publisher?.logotype, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Publisher logotype written to: ${filename}`);
      }
      imagePaths.publisherLogotype = filename;
    })
    .catch((error: string) => logger.warn(`Publisher logotype: ${error}`));

    await tools.downloadFile(trackData.album?.artwork, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Album artwork written to: ${filename}`);
      }
      imagePaths.frontCover = filename;
    })
    .catch((error: string) => logger.warn(`Album artwork: ${error}`));

    await tools.downloadFile(trackData.waveform, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Waveform written to: ${filename}`);
      }
      imagePaths.waveform = filename;
    })
    .catch((error: string) => logger.warn(`Waveform: ${error}`));

    const trackFilename = path.basename(trackPath);

    const eyeD3Options: string[] = [
      '--verbose',
      '--remove-frame', 'PRIV', '--remove-all-comments', // remove personal info: https://aaronk.me/removing-personal-information-from-mp3s-bought-off-amazon/
      '--remove-frame', 'TCOP', '--user-text-frame', 'DESCRIPTION:', // remove frmaes set by Athame (COPYRIGHT & DESCRIPTION)
      '--text-frame', 'TAUT:', // remove frame incompatible with v2.4
      '--preserve-file-times', // do not update file modification times
    ];

    if (trackData.artists && trackData.artists.length > 0) {
      eyeD3Options.push('--artist', trackData.artists.join(', '));
      // '--artist', trackData.artists.replace('ø', 'o'),
    }
    if (trackData.title) {
      // eyeD3Options.push('--title', trackData.title.replace(/^-/, '- '));
      eyeD3Options.push('--text-frame', `TIT2:${tools.escapeColonChar(trackData.title)}`); // --title option with a parameter starting with a hyphen (-) will cause eyeD3 to report the usage error
    }
    if (trackData.remixers && trackData.remixers.length > 0) {
      eyeD3Options.push('--text-frame', `TPE4:${tools.escapeColonChar(trackData.remixers.join(', '))}`); // TPE4 => REMIXEDBY
    }
    if (trackData.album?.title) {
      // eyeD3Options.push('--album', trackData.album.title.replace(/^-/, '- '));
      eyeD3Options.push('--text-frame', `TALB:${tools.escapeColonChar(trackData.album.title)}`); // the same as with --title
    }
    if (trackData.album && trackData.album.artists && trackData.album.artists.length > 0) {
      eyeD3Options.push('--album-artist', trackData.album.artists.join(', '));
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
      const releasedString = tools.convertDateToString(trackData.released);
      eyeD3Options.push('--text-frame', `TORY:${releasedString}`);
      eyeD3Options.push('--text-frame', `TRDA:${releasedString}`);
      eyeD3Options.push('--text-frame', `TDAT:${releasedString}`);
      eyeD3Options.push('--text-frame', `TDRC:${releasedString}`);
      eyeD3Options.push('--text-frame', `TDOR:${releasedString}`);
      eyeD3Options.push('--text-frame', `TDRL:${releasedString}`);
      // '--release-date', trackData.released,
      // '--orig-release-date', trackData.released,
    }
    if (trackData.url) {
      eyeD3Options.push('--url-frame', `WOAF:${tools.escapeColonChar(trackData.url.toString())}`); // file webpage
    }
    if (trackData.publisher?.url) {
      eyeD3Options.push('--url-frame', `WPUB:${tools.escapeColonChar(trackData.publisher.url.toString())}`); // publisher webpage
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
      eyeD3Options.push('--user-text-frame', `CATALOGNUMBER:${tools.escapeColonChar(trackData.album.catalogNumber)}`);
      eyeD3Options.push('--user-text-frame', `CATALOG #:${tools.escapeColonChar(trackData.album.catalogNumber)}`);
    }
    if (imagePaths.frontCover && tools.getMimeTypeFromPath(imagePaths.frontCover).startsWith('image')) {
      eyeD3Options.push('--add-image', `${imagePaths.frontCover}:FRONT_COVER:Front Cover`); // front cover
    }
    if (imagePaths.waveform && tools.getMimeTypeFromPath(imagePaths.waveform).startsWith('image')) {
      eyeD3Options.push('--add-image', `${imagePaths.waveform}:BRIGHT_COLORED_FISH:Waveform`); // waveform
    }
    if (imagePaths.publisherLogotype && tools.getMimeTypeFromPath(imagePaths.publisherLogotype).startsWith('image')) {
      eyeD3Options.push('--add-image', `${imagePaths.publisherLogotype}:PUBLISHER_LOGO:Publisher Logotype`); // publisher logo
    }
    if (trackData.genre) {
      eyeD3Options.push('--genre', trackData.genre);
    }
    if (trackData.publisher?.name) {
      eyeD3Options.push('--publisher', trackData.publisher.name);
      eyeD3Options.push('--text-frame', `TIT1:${tools.escapeColonChar(trackData.publisher.name)}`); // TIT1 => CONTENTGROUP
    }
    if (trackData.isrc) {
      eyeD3Options.push('--text-frame', `TSRC:${tools.escapeColonChar(trackData.isrc)}`);
    }
    if (trackData.ufid) {
      // '--unique-file-id', `http${colonEscapeChar}://www.id3.org/dummy/ufid.html:${trackData.ufid}`,
      eyeD3Options.push('--unique-file-id', `${tools.escapeColonChar(this.options.domainURL)}:${trackData.ufid}`);
    }

    eyeD3Options.push(trackPath);

    if (id3v2) {
      BearTunesTagger.executeEyeD3Tool(
        ID3Version.ID3v2_4,
        eyeD3Options,
        `MP3 ID3v${ID3Version.ID3v2_4} tag was saved to "${trackFilename}"`,
        this.options.verbose
      );
    }

    if (id3v1) {
      BearTunesTagger.executeEyeD3Tool(
        ID3Version.ID3v1_1,
        eyeD3Options,
        `MP3 ID3v${ID3Version.ID3v1_1} tag was saved to "${trackFilename}"`,
        this.options.verbose
      );
    }

    // Moved to separate module BearTunesRenamer:
    // Correct filename to match ID3 tag info:
    // const correctedFilename = tools.replacePathForbiddenChars(`${trackData.artists} - ${trackData.title}${path.extname(trackPath)}`);
    // fs.renameSync(trackPath, path.dirname(trackPath) + path.sep + correctedFilename);
    // logger.info(`File was renamed to: ${correctedFilename}`);
    // fs.rename(trackPath, path.dirname(trackPath) + path.sep + correctedFilename, (error) => {
    //   if (error) {
    //     console.error(`Couldn't rename ${trackFilename}`);
    //     return;
    //   }
    //   console.log(`File was renamed to: ${correctedFilename}`);
    // });

    Object.values(imagePaths).forEach((imagePath) => path && fs.unlinkSync(imagePath));
  }

  static executeEyeD3Tool(version: ID3Version, options: string[], successMessage: string, verbose: boolean = false): number {
    return tools.executeChildProcess(
      'eyeD3',
      [
        '--v2',
        `--to-v${version.toString()}`, // overwrite other versions of id3
        ...options,
      ],
      successMessage,
      verbose,
    );
  }

  async saveId3TagToFlacFile(trackPath: string, trackData: TrackInfo, { verbose = false } = {}): Promise<void> {
    const imagePaths: TrackArtworkFiles = {};
    await tools.downloadFile(trackData.publisher?.logotype, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Publisher logotype written to: ${filename}`);
      }
      imagePaths.publisherLogotype = filename;
    })
    .catch((error: string) => logger.warn(`Publisher logotype: ${error}`));

    await tools.downloadFile(trackData.album?.artwork, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Album artwork written to: ${filename}`);
      }
      imagePaths.frontCover = filename;
    })
    .catch((error: string) => logger.warn(`Album artwork: ${error}`));

    await tools.downloadFile(trackData.waveform, null, (filename: string) => {
      if (verbose) {
        logger.debug(`Waveform written to: ${filename}`);
      }
      imagePaths.waveform = filename;
    })
    .catch((error: string) => logger.warn(`Waveform: ${error}`));

    const metaflacOptions: string[] = [
      '--remove-tag=PRIV', '--remove-tag=COMMENT',
      '--remove-tag=DESCRIPTION', '--remove-tag=COPYRIGHT',
      '--remove-tag=DISCNUMBER', '--remove-tag=DISCTOTAL', '--remove-tag=COMPOSER', '--remove-tag=LYRICS', // tags set by tidal-dl
      '--remove-replay-gain',
      // '--remove-all-tags',
    ];

    if (trackData.artists && trackData.artists.length > 0) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'ARTIST', trackData.artists.join(', '));
    }

    if (trackData.title) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'TITLE', trackData.title);
    }

    if (trackData.remixers && trackData.remixers.length > 0) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'REMIXED BY', trackData.remixers.join(', '));
    }

    if (trackData.album?.title) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'ALBUM', trackData.album.title);
    }

    if (trackData.album && trackData.album.artists && trackData.album.artists.length > 0) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'ALBUMARTIST', trackData.album.artists.join(', '));
    }

    if (trackData.album?.trackNumber) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'TRACKNUMBER', trackData.album.trackNumber.toString());
    }
    if (trackData.album?.trackTotal) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'TRACKTOTAL', trackData.album.trackTotal.toString());
    }

    if (trackData.year) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'DATE', trackData.year.toString()); // DATE = Year <= same as in mp3 tag
    }

    if (trackData.released) {
      const releasedString = tools.convertDateToString(trackData.released);
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'RELEASE DATE', releasedString);
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'ORIGINAL RELEASE DATE', releasedString);
    }

    if (trackData.url) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'FILE WEBPAGE URL', trackData.url.toString());
    }

    if (trackData.publisher?.url) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'PUBLISHER URL', trackData.publisher.url.toString());
    }

    if (trackData.bpm) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'BPM', trackData.bpm.toString());
    }

    if (trackData.key) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'INITIAL KEY', trackData.key);
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'INITIALKEY', trackData.key);
    }

    if (trackData.album?.catalogNumber) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'CATALOGNUMBER', trackData.album.catalogNumber);
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'CATALOG #', trackData.album.catalogNumber);
    }

    if (trackData.genre) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'GENRE', trackData.genre);
    }

    if (trackData.publisher?.name) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'PUBLISHER', trackData.publisher.name);
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'GROUPING', trackData.publisher.name);
    }

    if (trackData.ufid) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'UFID', trackData.ufid);
    }

    if (trackData.isrc) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'ISRC', trackData.isrc);
    }

    // removing all embedded images
    if (imagePaths.frontCover || imagePaths.waveform || imagePaths.publisherLogotype) {
      BearTunesTagger.executeMetaflacTool(
        [
          '--remove', '--block-type=PICTURE,PADDING',
          trackPath,
        ],
        `All picture blocks removed in "${path.basename(trackPath)}"`,
        this.options.verbose,
      );
    }

    if (imagePaths.frontCover && tools.getMimeTypeFromPath(imagePaths.frontCover).startsWith('image')) {
      metaflacOptions.push(`--import-picture-from=3||Front Cover||${imagePaths.frontCover}`); // front cover
    }
    if (imagePaths.waveform && tools.getMimeTypeFromPath(imagePaths.waveform).startsWith('image')) {
      metaflacOptions.push(`--import-picture-from=17||Waveform||${imagePaths.waveform}`); // waveform
    }
    if (imagePaths.publisherLogotype && tools.getMimeTypeFromPath(imagePaths.publisherLogotype).startsWith('image')) {
      metaflacOptions.push(`--import-picture-from=20||Publisher Logotype||${imagePaths.publisherLogotype}`); // publisher logo
    }

    metaflacOptions.push(trackPath);

    BearTunesTagger.executeMetaflacTool(metaflacOptions, `Flac ID3 tag was saved to "${path.basename(trackPath)}"`, this.options.verbose);

    Object.values(imagePaths).forEach((imagePath) => path && fs.unlinkSync(imagePath));
  }

  static addMetaflacTaggingOption(optionArray: string[], tagName: string, tagValue: string) {
    optionArray.push(`--remove-tag=${tagName}`);
    optionArray.push(`--set-tag=${tagName}=${tagValue}`);
  }

  static executeMetaflacTool(options: string[], successMessage: string, verbose: boolean = false): number {
    return tools.executeChildProcess(
      'metaflac',
      [
        '--preserve-modtime',
        '--dont-use-padding',
        ...options,
      ],
      successMessage,
      verbose,
    );
  }
}
