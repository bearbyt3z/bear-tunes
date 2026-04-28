import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '#logger';
import {
  normalizeTrackTitle,
  normalizeTrackArtists,
} from '#normalizer';
import {
  arrayIntersection,
  arrayToLowerCase,
  buildGenreTag,
  buildKeyTag,
  capitalize,
  downloadImage,
  escapeUnescapedColons,
  executeCommandSync,
  extractTrackNameKeywords,
  fetchWebPage,
  formatLocalDateToIsoDateString,
  getFirstLine,
  isObjectRecord,
  isSupportedArtworkFile,
  isUnknownArray,
  normalizeMetadataText,
  prompt,
  removeFilenameExtension,
  replacePathForbiddenCharsInArray,
  roundToDecimalPlaces,
  sanitizeMetadataTagValue,
  secondsToTimeFormat,
  slugify,
  tryGetUrlFromFile,
  tryParsePositiveInteger,
  tryParseUrl,
} from '#tools';

import {
  BeatportSearchResultArtistType,
  ID3Version,
} from './types.js';

import {
  normalizeTrackInfo,
} from '#shared-types-normalizer';

import {
  trackInfoSchema,
} from '#shared-types-schema';

import type {
  BearTunesTaggerOptions,
  BeatportAlbumInfo,
  BeatportArtistInfo,
  BeatportPublisherInfo,
  BeatportSearchResultArtistInfo,
  BeatportSearchResultGenreInfo,
  BeatportSearchResultTrackInfo,
  BeatportTrackInfo,
  DownloadImageAssetOptions, // @internal
  MatchingTrack,
  TrackArtworkFiles,
} from './types.js';

import type {
  TrackInfo,
  AlbumInfo,
  PublisherInfo,
} from '#shared-types';

// exporting enums & types, so they will be included in the tagger import
export {
  BeatportSearchResultArtistType,
  ID3Version,
};

export type {
  BearTunesTaggerOptions,
  MatchingTrack,
  TrackArtworkFiles,
  BeatportSearchResultArtistInfo,
  BeatportSearchResultTrackInfo,
  BeatportSearchResultGenreInfo,
  BeatportArtistInfo,
  BeatportTrackInfo,
  BeatportAlbumInfo,
  BeatportPublisherInfo,
};

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
  verbose: true,
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
    const trackFilenameWithoutExtension = removeFilenameExtension(trackFilename);
    const trackFilenameKeywords = extractTrackNameKeywords(trackFilenameWithoutExtension);

    logger.silly('########################################');
    logger.info(`Filename [${trackFilenameKeywords.length}]: ${trackFilename}`);

    const trackUrlFilename = path.join(path.dirname(trackPath), `${trackFilenameWithoutExtension}.url`);
    let trackUrl: URL | undefined;

    if (fs.existsSync(trackUrlFilename)) {
      trackUrl = await tryGetUrlFromFile(trackUrlFilename);

      if (trackUrl === null) {
        logger.warn(`URL file is present but no URL found inside (skipping): ${trackUrlFilename}`);
        return {};
      }

      logger.info(`Using URL from file: ${trackUrl}`);
    } else {
      const trackInfo = this.extractId3Tag(trackPath);

      let bestMatchingTrack;
      try {
        bestMatchingTrack = await this.findBestMatchingTrack(trackInfo, trackFilenameKeywords);
      } catch (error) {
        logger.error(`Track matching failed for "${trackFilename}"`, { error });
        return {};
      }

      trackUrl = bestMatchingTrack.url ?? undefined;

      if (bestMatchingTrack.score < Math.max(2, trackFilenameKeywords.length)) {
        let warnMessage = `Couldn't match any track, the higgest score was ${bestMatchingTrack.score} for track:\n`;
        warnMessage += `${bestMatchingTrack.fullName}\n`;
        warnMessage += `Score keywords: ${bestMatchingTrack.scoreKeywords.join(', ')}\n`;
        warnMessage += `Name  keywords: ${trackFilenameKeywords.join(', ')}`;
        if (trackUrl) {
          warnMessage += `\nURL: ${trackUrl}`;
        }

        logger.warn(warnMessage);

        const proceedWithFound = await prompt('Proceed with the found track? (y/n) ');
        if (proceedWithFound !== 'y' && proceedWithFound !== 'yes') {
          return {};
        }
      }

      logger.info(`Matched  [${bestMatchingTrack.score}]: ${bestMatchingTrack.fullName}`);
      logger.info(`Matched  URL: ${bestMatchingTrack.url ?? 'Undefined'}`);

      if (
        trackInfo.details
        && bestMatchingTrack.details
        && Math.abs(bestMatchingTrack.details.duration - trackInfo.details.duration) > this.options.lengthDifferenceAccepted
      ) {
        logger.warn(`Matched track has different duration: ${secondsToTimeFormat(bestMatchingTrack.details.duration)}`
          + ` vs. ${secondsToTimeFormat(trackInfo.details.duration)} (original)\nURL: ${trackUrl}`);

        const changeToRadioEdit = await prompt('Change it to "Radio Edit"? (y)es/(n)o/(s)kip: ');
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
      logger.warn(`Cannot read ID3 tag of ${path.basename(trackPath)}:\n${getFirstLine(displayPluginOutput.stderr)}`); // show only first line of error from plugin (ommit traceback)
      return {};
    }

    // console.log(displayPluginOutput.stdout);

    try {
      const id3TagJson: unknown = JSON.parse(
        displayPluginOutput.stdout
          .replaceAll('\u0003', '') // replace unicode characters that break parse() (e.g. Beatoprt's ETX 0x03 at the beginning of URL)
          .replaceAll(/,\s*\}/g, '}'), // remove trailing commas that comes from plugin pattern (text-fields)
      );

      const normalizedTrackInfo = normalizeTrackInfo(id3TagJson);
      const parsedTrackInfo = trackInfoSchema.safeParse(normalizedTrackInfo);

      if (!parsedTrackInfo.success) {
        logger.warn('Cannot validate ID3 tag output from display plugin', { error: parsedTrackInfo.error });
        return {};
      }

      return parsedTrackInfo.data;

      // return id3TagJson as TrackInfo;
    } catch (error) {
      logger.warn('Cannot parse ID3 tag output from display plugin', { error });
      return {};
    }
  }

  static async extractNextJSData(url: URL): Promise<unknown> {
    const doc = await fetchWebPage(url);

    const nextJSElement = doc.querySelector('#__NEXT_DATA__'); // Next.js object containing element
    const nextJSText = nextJSElement?.textContent; // Next.js object text

    if (!nextJSText) throw new TypeError('Cannot obtain Next.js object.');

    let data: unknown;
    try {
      data = JSON.parse(nextJSText);
    } catch (error) {
      throw new TypeError('Cannot parse Next.js object.', { cause: error });
    }

    if (!isObjectRecord(data)) {
      throw new TypeError('Parsed Next.js object is not an object.');
    }

    const props = data.props;
    if (!isObjectRecord(props)) {
      throw new TypeError('Cannot unpack props from Next.js object.');
    }

    const pageProps = props.pageProps;
    if (!isObjectRecord(pageProps)) {
      throw new TypeError('Cannot unpack pageProps from Next.js object.');
    }

    const dehydratedState = pageProps.dehydratedState;
    if (!isObjectRecord(dehydratedState)) {
      throw new TypeError('Cannot unpack dehydratedState from Next.js object.');
    }

    const queries = dehydratedState.queries;
    if (!isUnknownArray(queries) || queries.length < 1) {
      throw new TypeError('Cannot unpack queries from Next.js object.');
    }

    const firstQuery = queries[0];
    if (!isObjectRecord(firstQuery)) {
      throw new TypeError('Cannot unpack first query from Next.js object.');
    }

    const state = firstQuery.state;
    if (!isObjectRecord(state)) {
      throw new TypeError('Cannot unpack state from Next.js object.');
    }

    const stateData = state.data;
    if (!stateData) {
      throw new TypeError('Cannot unpack state data from Next.js object.');
    }

    if (
      isObjectRecord(stateData)
      && 'data' in stateData
      && isUnknownArray(stateData.data)
    ) {
      return stateData.data;
    }

    return stateData;
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
      const trackTitle = normalizeTrackTitle(trackEntry.track_name, trackEntry.mix_name);

      const trackArtists = normalizeTrackArtists(trackEntry.artists
        .filter((x: BeatportSearchResultArtistInfo) => x.artist_type_name === BeatportSearchResultArtistType.Artist)
        .map((x: BeatportSearchResultArtistInfo) => x.artist_name),
      );

      const trackRemixers = normalizeTrackArtists(trackEntry.artists
        .filter((x: BeatportSearchResultArtistInfo) => x.artist_type_name === BeatportSearchResultArtistType.Remixer)
        .map((x: BeatportSearchResultArtistInfo) => x.artist_name),
      );

      const trackReleased = new Date(trackEntry.release_date);

      const trackKeywords = extractTrackNameKeywords([trackArtists.join(' '), trackTitle]);
      // const trackKeywords = Array.from(new Set([
      //   ...trackTitle.split(/\s+/),
      //   ...trackRemixed.split(/\s+/),
      //   ...trackArtists.split(/[\s,]+/),
      //   ...trackRemixers.split(/[\s,]+/),
      // ]));

      const keywordsIntersection = arrayIntersection(
        arrayToLowerCase(inputKeywords),
        replacePathForbiddenCharsInArray(arrayToLowerCase(trackKeywords)),
      );

      const score = keywordsIntersection.length;
      const trackLength = roundToDecimalPlaces(trackEntry.length / 1000.0, 2);

      const hasBetterScore = score > winner.score;

      const hasSameScoreButEarlierRelease = (
        score === winner.score
        && (!winner.released || trackReleased < winner.released)
      );

      const currentDurationDistance = trackInfo.details
        ? Math.abs(trackLength - trackInfo.details.duration)
        : undefined;

      const winnerDurationDistance = trackInfo.details
        ? Math.abs(winner.details!.duration - trackInfo.details.duration)
        : undefined;

      const hasSameScoreButCloserDuration = (
        score === winner.score
        && trackLength > 0
        && currentDurationDistance !== undefined
        && winnerDurationDistance !== undefined
        && currentDurationDistance < winnerDurationDistance
      );

      if (hasBetterScore
        || hasSameScoreButEarlierRelease
        || hasSameScoreButCloserDuration) {
        winner.details!.duration = trackLength; // the initialization of the winner variable (at the beginning) ensures that details prop is defined
        winner.score = score;
        winner.scoreKeywords = keywordsIntersection;
        winner.released = trackReleased;
        winner.title = trackTitle;
        winner.artists = trackArtists;
        winner.remixers = trackRemixers;
        winner.url = new URL(`${this.options.domainURL}/track/${slugify(trackEntry.track_name)}/${trackEntry.track_id}`);

        // if (score === inputKeywords.length) break;  // winner has been found (but maybe not the earliest release!)
      }
    }

    return winner;
  }

  async extractTrackData(trackUrl: URL, forceRadioEdit: boolean): Promise<TrackInfo> {
    const trackData = await BearTunesTagger.extractNextJSData(trackUrl) as BeatportTrackInfo;

    let title = normalizeTrackTitle(trackData.name, trackData.mix_name);

    if (forceRadioEdit) {
      const match = title.match(/Original Mix|Extended Mix/i);
      if (match != null && match.length >= 1) {
        title = title.replace(match[0], 'Radio Edit');
      } else {
        title += ' (Radio Edit)';
      }
    }

    const artists = normalizeTrackArtists(trackData.artists.map((x: BeatportArtistInfo) => x.name));
    const remixers = normalizeTrackArtists(trackData.remixers.map((x: BeatportArtistInfo) => x.name));

    const released = new Date(trackData.new_release_date); // or publish_date???
    const year = tryParsePositiveInteger(released.getFullYear());

    const bpm = tryParsePositiveInteger(trackData.bpm);
    const key = buildKeyTag(trackData.key?.name);
    const genre = trackData.genre?.name?.trim();
    const subgenre = trackData.sub_genre?.name?.trim();

    const duration = roundToDecimalPlaces(trackData.length_ms / 1000.0, 2);

    const waveform = tryParseUrl(trackData.image?.uri);

    const isrc = trackData.isrc;
    const trackUfid = `track-${trackData.id}`;

    const publisherUrl = trackData.release?.label ? new URL(`${this.options.domainURL}/label/${trackData.release.label.slug}/${trackData.release.label.id}`) : undefined;
    const publisher = publisherUrl ? await BearTunesTagger.extractPublisherData(publisherUrl) : undefined;

    const albumUrl = trackData.release ? new URL(`${this.options.domainURL}/release/${trackData.release.slug}/${trackData.release.id}`) : undefined;
    const album = albumUrl ? await BearTunesTagger.extractAlbumData(albumUrl, trackData.number) : undefined;

    return {
      url: trackUrl,
      artists,
      title,
      remixers,
      released,
      year,
      genre,
      subgenre,
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

    const artists = normalizeTrackArtists(albumData.artists.map((x: BeatportArtistInfo) => x.name));
    const title = normalizeMetadataText(albumData.name);
    const catalogNumber = albumData.catalog_number;
    const trackTotal = tryParsePositiveInteger(albumData.track_count);
    const artwork = tryParseUrl(albumData.image?.uri);

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
    const logotype = tryParseUrl(publisherData.image?.uri);

    return {
      name,
      url: publisherUrl,
      logotype,
    };
  }

  /**
   * Attempts to download an image asset.
   *
   * Returns `undefined` when the image URL is missing or when the download fails.
   * Logs a warning for missing image URLs and an error for failed downloads.
   * When provided, `sourcePageUrl` is passed as the HTTP `Referer` value for the image request.
   *
   * @param options - Image asset download options.
   * @returns Downloaded image filename, or `undefined` when the image could not be downloaded.
   */
  private static async tryDownloadImageAsset(options: DownloadImageAssetOptions): Promise<string | undefined> {
    const {
      imageUrl,
      sourcePageUrl,
      label,
      verbose = false,
    } = options;

    const capitalizedLabel = capitalize(label);

    if (!imageUrl) {
      logger.warn(`${capitalizedLabel} is missing.`, {
        sourcePageUrl: sourcePageUrl?.toString(),
      });

      return undefined;
    }

    try {
      const filename = await downloadImage(imageUrl, {
        referer: sourcePageUrl,
      });

      if (verbose) {
        logger.debug(`${capitalizedLabel} written to: ${filename}`);
      }

      return filename;
    } catch (error: unknown) {
      logger.error(`Failed to download ${label}.`, {
        imageUrl: imageUrl.toString(),
        sourcePageUrl: sourcePageUrl?.toString(),
        error,
      });

      return undefined;
    }
  }

  static cleanupTrackArtworkFiles(imagePaths: TrackArtworkFiles): void {
    Object.values(imagePaths).forEach((imagePath) => {
      if (imagePath !== undefined) {
        /*
         * TypeScript/ESLint incorrectly infers `Object.values(imagePaths)` as producing `any` elements,
         * despite `imagePaths` being typed as `TrackArtworkFiles` (with optional `string` properties).
         *
         * This is a known limitation in TS inference for `Object.values()` with optional object properties:
         * optional fields (`string | undefined`) are not properly preserved in the array result.
         *
         * Runtime guard `if (imagePath !== undefined)` ensures safety before `unlinkSync()`.
         *
         * Refs:
         * - [TS #44494](https://github.com/microsoft/TypeScript/issues/44494)
         * - [TS #48587](https://github.com/microsoft/TypeScript/issues/48587)
         *
         */
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        fs.unlinkSync(imagePath);
      }
    });
  }

  async saveId3TagToMp3File(trackPath: string, trackData: TrackInfo, { id3v2 = true, id3v1 = true, verbose = false } = {}): Promise<void> {
    const imagePaths: TrackArtworkFiles = {};

    imagePaths.publisherLogotype = await BearTunesTagger.tryDownloadImageAsset({
      imageUrl: trackData.publisher?.logotype,
      sourcePageUrl: trackData.publisher?.url,
      label: 'publisher logotype',
      verbose,
    });

    imagePaths.frontCover = await BearTunesTagger.tryDownloadImageAsset({
      imageUrl: trackData.album?.artwork,
      sourcePageUrl: trackData.album?.url,
      label: 'album artwork',
      verbose,
    });

    imagePaths.waveform = await BearTunesTagger.tryDownloadImageAsset({
      imageUrl: trackData.waveform,
      sourcePageUrl: trackData.url,
      label: 'waveform',
      verbose,
    });

    const trackFilename = path.basename(trackPath);

    const eyeD3Options: string[] = [
      '--verbose',
      '--remove-frame', 'PRIV', '--remove-all-comments', // remove personal info: https://aaronk.me/removing-personal-information-from-mp3s-bought-off-amazon/
      '--remove-frame', 'TCOP', '--user-text-frame', 'DESCRIPTION:', // remove frmaes set by Athame (COPYRIGHT & DESCRIPTION)
      '--text-frame', 'TAUT:', // remove frame incompatible with v2.4
      '--preserve-file-times', // do not update file modification times
    ];

    if (trackData.artists && trackData.artists.length > 0) {
      eyeD3Options.push('--artist', sanitizeMetadataTagValue(trackData.artists.join(', ')));
      // '--artist', trackData.artists.replace('ø', 'o'),
    }
    if (trackData.title) {
      // eyeD3Options.push('--title', trackData.title.replace(/^-/, '- '));
      eyeD3Options.push('--text-frame', `TIT2:${escapeUnescapedColons(sanitizeMetadataTagValue(trackData.title))}`); // --title option with a parameter starting with a hyphen (-) will cause eyeD3 to report the usage error
    }
    if (trackData.remixers && trackData.remixers.length > 0) {
      eyeD3Options.push('--text-frame', `TPE4:${escapeUnescapedColons(sanitizeMetadataTagValue(trackData.remixers.join(', ')))}`); // TPE4 => REMIXEDBY
    }
    if (trackData.album?.title) {
      // eyeD3Options.push('--album', trackData.album.title.replace(/^-/, '- '));
      eyeD3Options.push('--text-frame', `TALB:${escapeUnescapedColons(trackData.album.title)}`); // the same as with --title
    }
    if (trackData.album?.artists && trackData.album.artists.length > 0) {
      eyeD3Options.push('--album-artist', sanitizeMetadataTagValue(trackData.album.artists.join(', ')));
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
      const releasedString = formatLocalDateToIsoDateString(trackData.released);
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
      eyeD3Options.push('--url-frame', `WOAF:${escapeUnescapedColons(trackData.url.toString())}`); // file webpage
    }
    if (trackData.publisher?.url) {
      eyeD3Options.push('--url-frame', `WPUB:${escapeUnescapedColons(trackData.publisher.url.toString())}`); // publisher webpage
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
      eyeD3Options.push('--user-text-frame', `CATALOGNUMBER:${escapeUnescapedColons(trackData.album.catalogNumber)}`);
      eyeD3Options.push('--user-text-frame', `CATALOG #:${escapeUnescapedColons(trackData.album.catalogNumber)}`);
    }

    if (imagePaths.frontCover && await isSupportedArtworkFile(imagePaths.frontCover)) {
      eyeD3Options.push('--add-image', `${imagePaths.frontCover}:FRONT_COVER:Front Cover`); // front cover
    }
    if (imagePaths.waveform && await isSupportedArtworkFile(imagePaths.waveform)) {
      eyeD3Options.push('--add-image', `${imagePaths.waveform}:BRIGHT_COLORED_FISH:Waveform`); // waveform
    }
    if (imagePaths.publisherLogotype && await isSupportedArtworkFile(imagePaths.publisherLogotype)) {
      eyeD3Options.push('--add-image', `${imagePaths.publisherLogotype}:PUBLISHER_LOGO:Publisher Logotype`); // publisher logo
    }

    const genreTag = buildGenreTag(trackData.genre, trackData.subgenre);
    if (genreTag) {
      eyeD3Options.push('--genre', genreTag);
    }
    if (trackData.publisher?.name) {
      eyeD3Options.push('--publisher', trackData.publisher.name);
      eyeD3Options.push('--text-frame', `TIT1:${escapeUnescapedColons(trackData.publisher.name)}`); // TIT1 => CONTENTGROUP
    }
    if (trackData.isrc) {
      eyeD3Options.push('--text-frame', `TSRC:${escapeUnescapedColons(trackData.isrc)}`);
    }
    if (trackData.ufid) {
      // '--unique-file-id', `http${colonEscapeChar}://www.id3.org/dummy/ufid.html:${trackData.ufid}`,
      eyeD3Options.push('--unique-file-id', `${escapeUnescapedColons(this.options.domainURL)}:${trackData.ufid}`);
    }

    eyeD3Options.push(trackPath);

    if (id3v2) {
      // Remove embedded images (only id3v2 has image frames)
      BearTunesTagger.executeEyeD3Tool(
        ID3Version.ID3v2_4,
        [
          '--remove-all-images',
        ],
        `All picture blocks of ID3v${ID3Version.ID3v2_4} MP3 tag removed in "${path.basename(trackPath)}"`,
        this.options.verbose,
      );

      BearTunesTagger.executeEyeD3Tool(
        ID3Version.ID3v2_4,
        eyeD3Options,
        `MP3 ID3v${ID3Version.ID3v2_4} tag was saved to "${trackFilename}"`,
        this.options.verbose,
      );
    }

    if (id3v1) {
      BearTunesTagger.executeEyeD3Tool(
        ID3Version.ID3v1_1,
        eyeD3Options,
        `MP3 ID3v${ID3Version.ID3v1_1} tag was saved to "${trackFilename}"`,
        this.options.verbose,
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

    BearTunesTagger.cleanupTrackArtworkFiles(imagePaths);
  }

  static executeEyeD3Tool(
    version: ID3Version,
    options: string[],
    successMessage: string,
    verbose = false,
  ): boolean {
    try {
      const result = executeCommandSync(
        'eyeD3',
        [
          '--v2',
          `--to-v${version.toString()}`, // overwrite other versions of id3
          ...options,
        ],
      );

      logger.info(verbose ? result.stdout : successMessage);
      return true;
    } catch (error) {
      logger.error('Failed to save MP3 ID3 tag.', {
        tool: 'eyeD3',
        id3Version: version,
        error,
      });
      return false;
    }
  }

  async saveId3TagToFlacFile(trackPath: string, trackData: TrackInfo, { verbose = false } = {}): Promise<void> {
    const imagePaths: TrackArtworkFiles = {};

    imagePaths.publisherLogotype = await BearTunesTagger.tryDownloadImageAsset({
      imageUrl: trackData.publisher?.logotype,
      sourcePageUrl: trackData.publisher?.url,
      label: 'publisher logotype',
      verbose,
    });

    imagePaths.frontCover = await BearTunesTagger.tryDownloadImageAsset({
      imageUrl: trackData.album?.artwork,
      sourcePageUrl: trackData.album?.url,
      label: 'album artwork',
      verbose,
    });

    imagePaths.waveform = await BearTunesTagger.tryDownloadImageAsset({
      imageUrl: trackData.waveform,
      sourcePageUrl: trackData.url,
      label: 'waveform',
      verbose,
    });

    const metaflacOptions: string[] = [
      '--remove-tag=PRIV', '--remove-tag=COMMENT',
      '--remove-tag=DESCRIPTION', '--remove-tag=COPYRIGHT',
      '--remove-tag=DISCNUMBER', '--remove-tag=DISCTOTAL', '--remove-tag=COMPOSER', '--remove-tag=LYRICS', // tags set by tidal-dl
      '--remove-tag=COMPATIBLE_BRANDS', '--remove-tag=MAJOR_BRAND', '--remove-tag=MINOR_VERSION', '--remove-tag=ENCODER', // tags set by tidal-dl-ng
      '--remove-replay-gain',
      // '--remove-all-tags',
    ];

    if (trackData.artists && trackData.artists.length > 0) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'ARTIST', sanitizeMetadataTagValue(trackData.artists.join(', ')));
    }

    if (trackData.title) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'TITLE', sanitizeMetadataTagValue(trackData.title));
    }

    if (trackData.remixers && trackData.remixers.length > 0) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'REMIXED BY', sanitizeMetadataTagValue(trackData.remixers.join(', ')));
    }

    if (trackData.album?.title) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'ALBUM', trackData.album.title);
    }

    if (trackData.album?.artists && trackData.album.artists.length > 0) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'ALBUMARTIST', sanitizeMetadataTagValue(trackData.album.artists.join(', ')));
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
      const releasedString = formatLocalDateToIsoDateString(trackData.released);
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

    const genreTag = buildGenreTag(trackData.genre, trackData.subgenre);
    if (genreTag) {
      BearTunesTagger.addMetaflacTaggingOption(metaflacOptions, 'GENRE', genreTag);
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

    if (imagePaths.frontCover && await isSupportedArtworkFile(imagePaths.frontCover)) {
      metaflacOptions.push(`--import-picture-from=3||Front Cover||${imagePaths.frontCover}`); // front cover
    }
    if (imagePaths.waveform && await isSupportedArtworkFile(imagePaths.waveform)) {
      metaflacOptions.push(`--import-picture-from=17||Waveform||${imagePaths.waveform}`); // waveform
    }
    if (imagePaths.publisherLogotype && await isSupportedArtworkFile(imagePaths.publisherLogotype)) {
      metaflacOptions.push(`--import-picture-from=20||Publisher Logotype||${imagePaths.publisherLogotype}`); // publisher logo
    }

    metaflacOptions.push(trackPath);

    BearTunesTagger.executeMetaflacTool(metaflacOptions, `Flac ID3 tag was saved to "${path.basename(trackPath)}"`, this.options.verbose);

    BearTunesTagger.cleanupTrackArtworkFiles(imagePaths);
  }

  static addMetaflacTaggingOption(optionArray: string[], tagName: string, tagValue: string): void {
    optionArray.push(`--remove-tag=${tagName}`);
    optionArray.push(`--set-tag=${tagName}=${tagValue}`);
  }

  static executeMetaflacTool(
    options: string[],
    successMessage: string,
    verbose = false,
  ): boolean {
    try {
      const result = executeCommandSync(
        'metaflac',
        [
          '--preserve-modtime',
          '--dont-use-padding',
          ...options,
        ],
      );

      logger.info(verbose ? result.stdout : successMessage);
      return true;
    } catch (error) {
      logger.error('Failed to save FLAC ID3 tag', {
        tool: 'metaflac',
        error,
      });
      return false;
    }
  }
}
