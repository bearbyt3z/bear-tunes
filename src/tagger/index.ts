import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  fetchBeatportAlbumPayload,
  fetchBeatportPublisherPayload,
  fetchBeatportSearchTrackPayload,
  fetchBeatportTrackPayload,
} from './beatport-data.js';
import {
  mapBeatportAlbumToAlbumInfo,
  mapBeatportPublisherToPublisherInfo,
  mapBeatportSearchResultTrackToTrackInfo,
  mapBeatportTrackToTrackInfo,
} from './types.mapper.js';

import { USER_AGENT_CACHE_FILE } from '#config';
import logger from '#logger';
import {
  normalizeTextCharacters,
} from '#normalizer';
import {
  AudioFileType,
  arrayIntersection,
  arrayToLowerCase,
  buildGenreTag,
  buildTrackFullName,
  capitalize,
  downloadImage,
  escapeUnescapedColons,
  executeCommandSync,
  extractTrackNameKeywords,
  formatLocalDateToIsoDateString,
  formatZodErrorIssues,
  generateRandomHexString,
  getFirstLine,
  isEmptyPlainObject,
  isSupportedArtworkFile,
  normalizeUnknownError,
  prompt,
  removeFilenameExtension,
  replacePathForbiddenCharsInArray,
  secondsToTimeFormat,
  tryGetUrlFromFile,
  tryGetAudioFileTypeFromFile,
} from '#tools';

import {
  TaggerGuardError,
} from './errors.js';
import {
  BearTunesTaggerFailureCode,
  BeatportSearchResultArtistType,
  FlacPictureBlockType,
  ID3Version,
} from './types.js';

import {
  normalizeTrackInfo,
} from '#shared-types-normalizer';

import {
  albumInfoSchema,
  publisherInfoSchema,
  trackInfoSchema,
} from '#shared-types-schema';

import type {
  BearTunesTaggerFailureResult,
  BearTunesTaggerOptions,
  BearTunesTaggerResult,
  BearTunesTaggerSuccessResult,
  BeatportAlbumInfo,
  BeatportArtistInfo,
  BeatportLabelInfo,
  BeatportPublisherInfo,
  BeatportReleaseInfo,
  BeatportSearchResultArtistInfo,
  BeatportSearchResultGenreInfo,
  BeatportSearchResultTrackInfo,
  BeatportTrackInfo,
  DownloadImageAssetOptions, // @internal
  ExportedFlacPictureBlock,
  FlacPictureBlockInfo,
  MatchingTrack,
  PreparedMp3TagTransfer,
  TrackArtworkFiles,
} from './types.js';

import type {
  TrackInfo,
  AlbumInfo,
  PublisherInfo,
} from '#shared-types';

// exporting enums & types, so they will be included in the tagger import
export {
  BearTunesTaggerFailureCode,
  BeatportSearchResultArtistType,
  FlacPictureBlockType,
  ID3Version,
};

export type {
  BearTunesTaggerFailureResult,
  BearTunesTaggerOptions,
  BearTunesTaggerResult,
  BearTunesTaggerSuccessResult,
  MatchingTrack,
  TrackArtworkFiles,
  BeatportSearchResultArtistInfo,
  BeatportSearchResultTrackInfo,
  BeatportSearchResultGenreInfo,
  BeatportArtistInfo,
  BeatportTrackInfo,
  BeatportAlbumInfo,
  BeatportPublisherInfo,
  ExportedFlacPictureBlock,
  FlacPictureBlockInfo,
  PreparedMp3TagTransfer,
};

/**
 * Builds the Beatport track search URL from the current tagger options.
 *
 * Combines the configured `trackSearchPath` with `domainURL` and returns a new
 * `URL` instance on each call, so callers can safely extend or modify the
 * returned value without mutating the underlying options object.
 *
 * @this {BearTunesTaggerOptions} Tagger options providing the Beatport domain
 * and track search path.
 * @returns A new URL instance pointing to the Beatport track search endpoint.
 */
function getTrackSearchURL(this: BearTunesTaggerOptions): URL {
  return new URL(this.trackSearchPath, this.domainURL);
}

/**
 * Default tagger options applied when custom options are not provided.
 */
// Default options are intentionally defined as immutable:
// - `as const` keeps exact literal types and readonly fields,
// - `satisfies` checks compatibility with the public options type,
// - `Object.freeze()` guards against accidental mutation at runtime.
const defaultTaggerOptions = Object.freeze({
  domainURL: 'https://www.beatport.com',
  trackSearchPath: '/search/tracks?per_page=150&q=', // we want tracks only
  get searchURL() {
    return getTrackSearchURL.call(this);
  },
  eyeD3DisplayPluginPatternFile: './eyed3-pattern.txt',
  lengthDifferenceAccepted: 3,
  verbose: true,
  eyed3Verbose: false,
  metaflacVerbose: false,
} as const satisfies BearTunesTaggerOptions);

/**
 * Reads and tags supported audio files used by BearTunes.
 */
export class BearTunesTagger {
  /**
   * Effective tagger configuration for this instance.
   */
  private readonly options: BearTunesTaggerOptions;

  /**
   * Creates a tagger instance with merged default and custom options.
   *
   * @param options - Partial tagger configuration overriding default values.
   */
  constructor(options: Partial<BearTunesTaggerOptions> = {}) {
    this.options = {
      ...defaultTaggerOptions,
      ...options,
    };

    Object.defineProperty(this.options, 'searchURL', {
      get: getTrackSearchURL,
      enumerable: true,
      configurable: true,
    });
  }

  /**
   * Creates a success result describing a completed tag read operation.
   *
   * @param trackInfo - Metadata read from the local audio file.
   * @returns A tagger success result with `ok` set to `true`.
   */
  private static createSuccessResult(
    trackInfo: TrackInfo,
  ): BearTunesTaggerSuccessResult {
    return { ok: true, trackInfo };
  }

  /**
   * Creates a failure result describing an unsuccessful tagger operation.
   *
   * @param failureCode - Domain-specific code classifying the tagger failure.
   * @param error - Error object describing the failure cause.
   * @returns A tagger failure result with `ok` set to `false`.
   */
  private static createFailureResult(
    failureCode: BearTunesTaggerFailureCode,
    error: Error,
    details?: Record<string, unknown>,
  ): BearTunesTaggerFailureResult {
    return {
      ok: false,
      failureCode,
      error,
      details,
    };
  }

  /**
   * Asserts that the input path points to an accessible regular file.
   *
   * @param trackPath - Path to the audio file to inspect.
   * @throws {TaggerGuardError} When the path cannot be accessed or does not
   * point to a regular file.
   */
  private assertAccessibleInputFile(trackPath: string): void {
    let trackPathStats: fs.Stats;

    try {
      trackPathStats = fs.lstatSync(trackPath);
    } catch (error) {
      throw new TaggerGuardError(
        BearTunesTaggerFailureCode.InputFileAccessError,
        new Error(
          `${this.constructor.name}: Cannot access input path ${trackPath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    if (!trackPathStats.isFile()) {
      throw new TaggerGuardError(
        BearTunesTaggerFailureCode.InputFileAccessError,
        new TypeError(
          `${this.constructor.name}: Specified input path is not a file: ${trackPath}`,
        ),
      );
    }
  }

  /**
   * Writes provided track metadata to a supported local audio file.
   *
   * The method validates that `trackPath` points to an accessible regular file,
   * detects the file audio type, and dispatches tag writing to the appropriate
   * format-specific writer. MP3 files are written through the ID3 writer and
   * FLAC files through the FLAC tag writer. AIFF files and unrecognized audio
   * formats are rejected as unsupported for tag writing.
   *
   * The public contract is result-based: internal guard failures are caught and
   * mapped to a classified {@link BearTunesTaggerFailureResult}, so callers do
   * not need to know about {@link TaggerGuardError}. Unexpected write-time
   * failures are normalized and mapped to `TagWriteFailed`.
   *
   * @param trackPath - Path to the local audio file that should receive the provided metadata.
   * @param trackInfo - Canonical track metadata to write into the target audio file.
   * @returns A result containing the written track metadata on success, or a classified failure.
   */
  async saveTag(
    trackPath: string,
    trackInfo: TrackInfo,
  ): Promise<BearTunesTaggerResult> {
    try {
      this.assertAccessibleInputFile(trackPath);

      const audioFileType = await tryGetAudioFileTypeFromFile(trackPath);

      switch (audioFileType) {
        case AudioFileType.Mp3:
          await this.saveTagToMp3File(trackPath, trackInfo);
          break;

        case AudioFileType.Flac:
          await this.saveTagToFlacFile(trackPath, trackInfo);
          break;

        case AudioFileType.Aiff:
        case undefined:
          return BearTunesTagger.createFailureResult(
            BearTunesTaggerFailureCode.UnsupportedAudioFileType,
            new TypeError(
              `${this.constructor.name}: Unsupported audio file type for tag writing ${audioFileType ?? 'unknown'} ${trackPath}`,
            ),
          );
      }

      return BearTunesTagger.createSuccessResult(trackInfo);
    } catch (error: unknown) {
      if (error instanceof TaggerGuardError) {
        return BearTunesTagger.createFailureResult(
          error.failureCode,
          error.cause,
          error.details,
        );
      }

      return BearTunesTagger.createFailureResult(
        BearTunesTaggerFailureCode.TagWriteFailed,
        normalizeUnknownError(error),
      );
    }
  }

  async processTrack(trackPath: string): Promise<BearTunesTaggerResult> {
    try {
      let forceRadioEdit = false;

      const trackFilename = path.basename(trackPath);
      const trackFilenameWithoutExtension = removeFilenameExtension(trackFilename);
      const trackFilenameKeywords = extractTrackNameKeywords(
        normalizeTextCharacters(trackFilenameWithoutExtension),
      );

      logger.silly('########################################');
      logger.info(`Filename [${trackFilenameKeywords.length}]: ${trackFilename}`);

      const trackUrlFilename = path.join(
        path.dirname(trackPath),
        `${trackFilenameWithoutExtension}.url`,
      );
      let trackUrl: URL | undefined;

      if (fs.existsSync(trackUrlFilename)) {
        trackUrl = await tryGetUrlFromFile(trackUrlFilename);

        if (trackUrl === null) {
          return BearTunesTagger.createFailureResult(
            BearTunesTaggerFailureCode.TrackUrlFileInvalid,
            new Error(
              `${this.constructor.name}: URL file is present but no URL was found inside: ${trackUrlFilename}`,
            ),
          );
        }

        logger.info(`Using URL from file: ${trackUrl}`);
      } else {
        const readTagResult = await this.readTag(trackPath);

        if (!readTagResult.ok) {
          return readTagResult;
        }

        const localTrackInfo = readTagResult.trackInfo;

        let bestMatchingTrack: MatchingTrack | undefined;

        try {
          bestMatchingTrack = await this.findBestMatchingTrack(
            localTrackInfo,
            trackFilenameKeywords,
          );
        } catch (error: unknown) {
          return BearTunesTagger.createFailureResult(
            BearTunesTaggerFailureCode.TrackMatchFailed,
            new Error(
              `${this.constructor.name}: Cannot match track "${trackFilename}"`,
              { cause: normalizeUnknownError(error) },
            ),
          );
        }

        if (!bestMatchingTrack) {
          return BearTunesTagger.createFailureResult(
            BearTunesTaggerFailureCode.TrackMatchFailed,
            new Error(
              `${this.constructor.name}: Could not find a matching Beatport track for "${trackFilename}"`,
            ),
          );
        }

        trackUrl = bestMatchingTrack.url;

        if (bestMatchingTrack.score < Math.max(2, trackFilenameKeywords.length)) {
          let warnMessage = `Couldn't match any track, the higgest score was ${bestMatchingTrack.score} for track:\n`;
          warnMessage += `${buildTrackFullName(bestMatchingTrack)}\n`;
          warnMessage += `Score keywords: ${bestMatchingTrack.scoreKeywords.join(', ')}\n`;
          warnMessage += `Name keywords: ${trackFilenameKeywords.join(', ')}`;

          if (trackUrl) {
            warnMessage += `\nURL: ${trackUrl}`;
          }

          logger.warn(warnMessage);

          const proceedWithFound = await prompt('Proceed with the found track? (y/n) ');

          if (proceedWithFound !== 'y' && proceedWithFound !== 'yes') {
            return BearTunesTagger.createFailureResult(
              BearTunesTaggerFailureCode.TrackMatchRejected,
              new Error(
                `${this.constructor.name}: Matching track was rejected for "${trackFilename}"`,
              ),
            );
          }
        }

        logger.info(
          `Matched [${bestMatchingTrack.score}]: ${buildTrackFullName(bestMatchingTrack)}`,
        );
        logger.info(`Matched URL: ${bestMatchingTrack.url ?? 'Undefined'}`);

        if (
          localTrackInfo.details
          && bestMatchingTrack.details
          && Math.abs(
            bestMatchingTrack.details.duration - localTrackInfo.details.duration,
          ) > this.options.lengthDifferenceAccepted
        ) {
          logger.warn(
            `Matched track has different duration: ${secondsToTimeFormat(bestMatchingTrack.details.duration)}`
            + ` vs. ${secondsToTimeFormat(localTrackInfo.details.duration)} (original)\nURL: ${trackUrl}`,
          );

          const changeToRadioEdit = await prompt(
            'Change it to "Radio Edit"? (y)es/(n)o/(s)kip: ',
          );

          if (changeToRadioEdit === 's' || changeToRadioEdit === 'skip') {
            return BearTunesTagger.createFailureResult(
              BearTunesTaggerFailureCode.TrackMatchRejected,
              new Error(
                `${this.constructor.name}: Matching track was skipped for "${trackFilename}"`,
              ),
            );
          }

          forceRadioEdit = changeToRadioEdit === 'y' || changeToRadioEdit === 'yes';
        }
      }

      if (!trackUrl) {
        return BearTunesTagger.createFailureResult(
          BearTunesTaggerFailureCode.TrackDataFetchFailed,
          new Error(
            `${this.constructor.name}: URL of the matching track was not found for "${trackFilename}"`,
          ),
        );
      }

      const trackInfo = await this.extractTrackData(trackUrl, forceRadioEdit);

      if (isEmptyPlainObject(trackInfo)) {
        return BearTunesTagger.createFailureResult(
          BearTunesTaggerFailureCode.TrackDataFetchFailed,
          new Error(
            `${this.constructor.name}: Cannot retrieve track metadata from ${trackUrl}`,
          ),
        );
      }

      await this.saveTagToMp3File(trackPath, trackInfo);

      return BearTunesTagger.createSuccessResult(trackInfo);
    } catch (error: unknown) {
      if (error instanceof TaggerGuardError) {
        return BearTunesTagger.createFailureResult(
          error.failureCode,
          error.cause,
          error.details,
        );
      }

      return BearTunesTagger.createFailureResult(
        BearTunesTaggerFailureCode.UnexpectedExecutionError,
        normalizeUnknownError(error),
      );
    }
  }

  /**
   * Reads local metadata from a supported audio file.
   *
   * MP3 files are read through the ID3 reader and FLAC files through the FLAC
   * tag reader. AIFF files and unrecognized audio formats are not currently
   * supported for local tag extraction.
   *
   * Reader failures and unsupported audio types are mapped to classified failure
   * results. Unexpected errors are mapped to an unexpected preparation failure.
   *
   * @param trackPath - Path to the local audio file whose embedded tags should
   * be read.
   * @returns A result containing parsed and validated track metadata, or a
   * classified failure.
   */
  async readTag(trackPath: string): Promise<BearTunesTaggerResult> {
    try {
      this.assertAccessibleInputFile(trackPath);

      const audioFileType = await tryGetAudioFileTypeFromFile(trackPath);

      switch (audioFileType) {
        case AudioFileType.Mp3:
          return BearTunesTagger.createSuccessResult(
            this.extractId3Tag(trackPath),
          );

        case AudioFileType.Flac:
          return BearTunesTagger.createSuccessResult(
            this.extractFlacTag(trackPath),
          );

        case AudioFileType.Aiff:
        case undefined:
          return BearTunesTagger.createFailureResult(
            BearTunesTaggerFailureCode.UnsupportedAudioFileType,
            new TypeError(
              `${this.constructor.name}: Unsupported audio file type: ${audioFileType ?? 'unknown'} (${trackPath})`,
            ),
          );
      }
    } catch (error) {
      if (error instanceof TaggerGuardError) {
        return BearTunesTagger.createFailureResult(
          error.failureCode,
          error.cause,
          error.details,
        );
      }

      return BearTunesTagger.createFailureResult(
        BearTunesTaggerFailureCode.UnexpectedPreparationError,
        normalizeUnknownError(error),
      );
    }
  }

  /**
   * Reads selected ID3 metadata from an MP3 file and maps it to `TrackInfo`.
   *
   * The method invokes the local ID3 reader, parses its JSON output, normalizes
   * the resulting data, and validates it against the shared track schema.
   *
   * @param trackPath - Path to the MP3 file to inspect.
   * @returns Parsed and validated local track metadata.
   * @throws {TaggerGuardError} When the ID3 reader cannot read the requested
   * metadata, its output cannot be parsed, or the normalized metadata does not
   * satisfy the track schema.
   */
  // Unfortunately display plugin is not available anymore in eyeD3 v0.9.7: https://github.com/nicfit/eyeD3/pull/585
  // This is mentioned also in history file: https://github.com/nicfit/eyeD3/blob/6ae155405770afbc1446432e71782d761218baa4/HISTORY.rst
  // "Changes: Removed display-plugin due to Grako EOL (#585)"
  // Old display plugin usage was:
  // const displayPluginOutput = childProcess.spawnSync('eyeD3', [
  //   '--plugin', 'display',
  //   '--pattern-file', this.options.eyeD3DisplayPluginPatternFile,
  //   trackPath,
  // ], {
  //   encoding: 'utf-8',
  // });
  private extractId3Tag(trackPath: string): TrackInfo {
    // Replacing eyeD3 display-plugin with a simple python script:
    const displayPluginOutput = childProcess.spawnSync(
      './eyed3-display-plugin.py',
      [
        this.options.eyeD3DisplayPluginPatternFile,
        trackPath,
      ],
      {
        encoding: 'utf-8',
      },
    );

    if (
      displayPluginOutput.error
      || displayPluginOutput.status !== 0
      || displayPluginOutput.stderr
    ) {
      const readerErrorMessage = displayPluginOutput.error?.message
        ?? getFirstLine(displayPluginOutput.stderr)
        ?? `ID3 reader exited with status ${String(displayPluginOutput.status)}`;

      throw new TaggerGuardError(
        BearTunesTaggerFailureCode.TagReadFailed,
        new Error(
          `${this.constructor.name}: Cannot read ID3 tag of ${path.basename(trackPath)}: `
          + readerErrorMessage,
          { cause: displayPluginOutput.error },
        ),
      );
    }

    try {
      const id3TagJson: unknown = JSON.parse(
        displayPluginOutput.stdout
          .replaceAll('\u0003', '') // replace unicode characters that break parse() (e.g. Beatoprt's ETX 0x03 at the beginning of URL)
          .replaceAll(/,\s*}/g, '}'), // remove trailing commas that comes from plugin pattern (text-fields)
      );

      const normalizedTrackInfo = normalizeTrackInfo(id3TagJson);
      const parsedTrackInfo = trackInfoSchema.safeParse(normalizedTrackInfo, {
        reportInput: true,
      });

      if (!parsedTrackInfo.success) {
        throw new TaggerGuardError(
          BearTunesTaggerFailureCode.TagReadFailed,
          new TypeError(
            `${this.constructor.name}: Cannot validate ID3 tag output from ${trackPath}`,
          ),
          {
            issues: formatZodErrorIssues(parsedTrackInfo.error),
          },
        );
      }

      return parsedTrackInfo.data;
    } catch (error) {
      if (error instanceof TaggerGuardError) {
        throw error;
      }

      throw new TaggerGuardError(
        BearTunesTaggerFailureCode.TagReadFailed,
        new Error(
          `${this.constructor.name}: Cannot parse ID3 tag output from ${trackPath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }
  }

  /**
   * Parses raw `metaflac` tag output into a normalized multivalue tag map.
   *
   * The command output is expected to contain one tag per line in the form
   * `KEY=value`. Tag names are normalized to uppercase so later lookups can be
   * performed case-insensitively, which matches FLAC/Vorbis comment semantics
   * and avoids depending on the exact casing returned by `metaflac`.
   *
   * Repeated tag names are preserved by storing all values in an array under the
   * same normalized key. Lines without a valid `=` separator are ignored.
   *
   * @param metaflacOutput Raw stdout returned by `metaflac --show-tag=...`.
   * @returns A map of normalized tag names to one or more extracted values.
   */
  private static parseMetaflacTags(metaflacOutput: string): Map<string, string[]> {
    const tags = new Map<string, string[]>();

    for (const line of metaflacOutput.split(/\r?\n/u)) {
      const separatorIndex = line.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      const tagName = line.slice(0, separatorIndex).trim().toUpperCase();
      const tagValue = line.slice(separatorIndex + 1);

      const existingValues = tags.get(tagName) ?? [];
      existingValues.push(tagValue);
      tags.set(tagName, existingValues);
    }

    return tags;
  }

  /**
   * Returns the first available value for any of the requested FLAC tag names.
   *
   * Each requested tag name is normalized to uppercase before lookup, so callers
   * may provide names in any casing. This helper is intended for fields that are
   * expected to resolve to a single logical value in `TrackInfo`.
   *
   * @param tags Parsed and normalized FLAC tag map.
   * @param tagNames Candidate tag names checked in order.
   * @returns The first matching tag value, or `undefined` when none is found.
   */
  private static getSingleMetaflacTag(
    tags: Map<string, string[]>,
    ...tagNames: string[]
  ): string | undefined {
    for (const tagName of tagNames) {
      const values = tags.get(tagName.toUpperCase());

      if (values && values.length > 0) {
        return values[0];
      }
    }

    return undefined;
  }

  /**
   * Returns all values for the first matching FLAC tag name.
   *
   * Each requested tag name is normalized to uppercase before lookup, so callers
   * may provide names in any casing. This helper is intended for multivalue
   * fields such as artists or other tags that may occur more than once.
   *
   * @param tags Parsed and normalized FLAC tag map.
   * @param tagNames Candidate tag names checked in order.
   * @returns All values of the first matching tag, or `undefined` when none is found.
   */
  private static getMultiMetaflacTag(
    tags: Map<string, string[]>,
    ...tagNames: string[]
  ): string[] | undefined {
    for (const tagName of tagNames) {
      const values = tags.get(tagName.toUpperCase());

      if (values && values.length > 0) {
        return values;
      }
    }

    return undefined;
  }

  /**
   * Extracts FLAC track duration from STREAMINFO values reported by `metaflac`.
   *
   * The duration is computed from `total samples / sample rate` using a single
   * `metaflac` invocation. The method returns `undefined` when the command fails,
   * the output is incomplete, or the parsed numeric values are invalid.
   *
   * @param flacFilePath Path to the FLAC file.
   * @returns Track duration in seconds, or `undefined` when it cannot be determined.
   */
  private static extractFlacDuration(flacFilePath: string): number | undefined {
    const metaflacResult = childProcess.spawnSync('metaflac', [
      '--show-total-samples',
      '--show-sample-rate',
      flacFilePath,
    ], {
      encoding: 'utf-8',
    });

    if (metaflacResult.status !== 0 || metaflacResult.error) {
      logger.warn('Cannot read FLAC stream info needed for duration', {
        flacFilePath,
        status: metaflacResult.status,
        error: metaflacResult.error,
        stderr: metaflacResult.stderr,
      });

      return undefined;
    }

    const lines = metaflacResult.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      logger.warn('Incomplete FLAC stream info output for duration extraction', {
        flacFilePath,
        output: metaflacResult.stdout,
      });

      return undefined;
    }

    const totalSamples = Number.parseInt(lines[0], 10);
    const sampleRate = Number.parseInt(lines[1], 10);

    if (!Number.isFinite(totalSamples) || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      logger.warn('Invalid FLAC stream info values for duration extraction', {
        flacFilePath,
        totalSamples: lines[0],
        sampleRate: lines[1],
      });

      return undefined;
    }

    return totalSamples / sampleRate;
  }

  /**
   * Reads selected metadata from a FLAC file and maps it to `TrackInfo`.
   *
   * The method reads selected Vorbis comment fields through `metaflac`, parses
   * them into a normalized tag map, and supplements the result with duration
   * extracted from the FLAC STREAMINFO metadata. It then normalizes the
   * assembled data and validates it against the shared track schema.
   *
   * @param flacFilePath - Path to the FLAC file to inspect.
   * @returns Parsed and validated local track metadata.
   * @throws {TaggerGuardError} When metaflac cannot read the requested tags, or
   * the normalized metadata does not satisfy the track schema.
   */
  private extractFlacTag(flacFilePath: string): TrackInfo {
    const metaflacResult = childProcess.spawnSync(
      'metaflac',
      [
        '--show-tag=ARTIST',
        '--show-tag=TITLE',
        '--show-tag=ALBUM',
        '--show-tag=ALBUMARTIST',
        '--show-tag=TRACKNUMBER',
        '--show-tag=TRACKTOTAL',
        '--show-tag=DISCNUMBER',
        '--show-tag=DISCTOTAL',
        '--show-tag=GENRE',
        '--show-tag=DATE',
        '--show-tag=COMPOSER',
        '--show-tag=ISRC',
        flacFilePath,
      ],
      {
        encoding: 'utf-8',
      },
    );

    if (
      metaflacResult.error
      || metaflacResult.status !== 0
      || metaflacResult.stderr // TODO: Verify whether metaflac can write non-error warnings to stderr on success.
    ) {
      const metaflacErrorMessage = metaflacResult.error?.message
        ?? getFirstLine(metaflacResult.stderr)
        ?? `metaflac exited with status ${String(metaflacResult.status)}`;

      throw new TaggerGuardError(
        BearTunesTaggerFailureCode.TagReadFailed,
        new Error(
          `${this.constructor.name}: Cannot read FLAC tag from ${flacFilePath}: `
          + metaflacErrorMessage,
          { cause: metaflacResult.error },
        ),
      );
    }

    const tags = BearTunesTagger.parseMetaflacTags(metaflacResult.stdout);
    const duration = BearTunesTagger.extractFlacDuration(flacFilePath);

    const rawTrackInfo = {
      artists: BearTunesTagger.getMultiMetaflacTag(tags, 'ARTIST'),
      title: BearTunesTagger.getSingleMetaflacTag(tags, 'TITLE'),
      genre: BearTunesTagger.getSingleMetaflacTag(tags, 'GENRE'),
      released: BearTunesTagger.getSingleMetaflacTag(tags, 'DATE'),
      details: (duration !== undefined) ? { duration } : undefined,
      album: {
        artists: BearTunesTagger.getMultiMetaflacTag(tags, 'ALBUMARTIST'),
        title: BearTunesTagger.getSingleMetaflacTag(tags, 'ALBUM'),
        trackNumber: BearTunesTagger.getSingleMetaflacTag(tags, 'TRACKNUMBER'),
        trackTotal: BearTunesTagger.getSingleMetaflacTag(tags, 'TRACKTOTAL'),
      },
    };

    const normalizedTrackInfo = normalizeTrackInfo(rawTrackInfo);
    const parsedTrackInfo = trackInfoSchema.safeParse(normalizedTrackInfo, {
      reportInput: true,
    });

    if (!parsedTrackInfo.success) {
      throw new TaggerGuardError(
        BearTunesTaggerFailureCode.TagReadFailed,
        new TypeError(
          `${this.constructor.name}: Cannot validate FLAC tag output from ${flacFilePath}`,
        ),
        {
          issues: formatZodErrorIssues(parsedTrackInfo.error),
        },
      );
    }

    return parsedTrackInfo.data;
  }

  /**
   * Exports selected PICTURE blocks from a FLAC file to image files.
   *
   * Only blocks whose type is included in `blockTypes` are exported.
   *
   * @param flacFilePath - Path to the source FLAC file.
   * @param blockTypes - FLAC PICTURE block types to export.
   * @returns Metadata of successfully exported picture blocks, including image file paths.
   */
  static exportFlacPictureBlocks(
    flacFilePath: string,
    blockTypes: FlacPictureBlockType[],
  ): ExportedFlacPictureBlock[] {
    const result: ExportedFlacPictureBlock[] = [];

    const flacPictureBlocks = BearTunesTagger.listFlacPictureBlocks(flacFilePath);
    if (flacPictureBlocks.length < 1) {
      return result;
    }

    const matchingPictureBlocks = flacPictureBlocks.filter((info) => blockTypes.includes(info.blockType));
    if (matchingPictureBlocks.length < 1) {
      return result;
    }

    for (const pictureBlockInfo of matchingPictureBlocks) {
      const imageFileExtension = pictureBlockInfo.mimeType.replace('image/', '');
      const imagePath = `${generateRandomHexString()}.${imageFileExtension}`;

      const metaflacResult = childProcess.spawnSync('metaflac', [
        `--block-number=${pictureBlockInfo.blockType.toString()}`,
        `--export-picture-to=${imagePath}`,
        flacFilePath,
      ]);

      if (metaflacResult.status === 0) {
        result.push({
          ...pictureBlockInfo,
          imagePath,
        });
      }
    }

    return result;
  }

  /**
   * Lists PICTURE blocks embedded in a FLAC file.
   *
   * The returned metadata contains the FLAC picture block type and declared MIME type
   * for each block that could be parsed from `metaflac` output.
   *
   * @param flacFilePath - Path to the FLAC file.
   * @returns Metadata of embedded FLAC PICTURE blocks.
   */
  static listFlacPictureBlocks(flacFilePath: string): FlacPictureBlockInfo[] {
    const result: FlacPictureBlockInfo[] = [];

    const metaflacResult = childProcess.spawnSync(
      `metaflac --list --block-type=PICTURE "${flacFilePath}" | grep -A8 -i metadata`,
      { shell: true },
    );

    if (metaflacResult.status !== 0) {
      return result;
    }

    const stdoutAsString = metaflacResult.stdout.toString();
    const blockNumbers = stdoutAsString.match(/(?<=METADATA block #)\d/gi) ?? [];
    const mimeTypes = stdoutAsString.match(/(?<=MIME type: )[a-z]*\/[a-z]*/gi) ?? [];

    const minLength = Math.min(blockNumbers.length, mimeTypes.length);

    if (minLength === 0) { // no images found
      return result;
    }

    if (blockNumbers.length !== mimeTypes.length) {
      logger.warn(`Amount of block numbers different than amount of mime types: only ${minLength} will be used`);
    }

    for (let i = 0; i < minLength; i += 1) {
      result.push({
        blockType: Number(blockNumbers[i]) as FlacPictureBlockType,
        mimeType: mimeTypes[i],
      });
    }

    return result;
  }

  /**
   * Prepares MP3 tag transfer data from a FLAC file.
   *
   * Reads selected metadata from the source FLAC file, maps it to `lame` CLI
   * tag options used during MP3 conversion, and exports supported embedded
   * artwork needed for that transfer.
   *
   * The returned payload contains both the prepared `lame` options and paths
   * to temporary files created while exporting artwork. The caller is
   * responsible for removing those temporary files after conversion completes.
   *
   * @param flacFilePath - Path to the source FLAC file.
   * @returns Prepared MP3 tag transfer payload for use during FLAC-to-MP3 conversion.
   */
  prepareMp3TagTransferFromFlac(flacFilePath: string): PreparedMp3TagTransfer {
    const result: PreparedMp3TagTransfer = {
      lameTagOptions: [],
      temporaryFiles: [],
    };

    const flacTrackInfo = this.extractFlacTag(flacFilePath);

    const tagOptions = ['--add-id3v2'];

    if (flacTrackInfo.title) {
      tagOptions.push(`--tt "${flacTrackInfo.title}"`);
    }

    if (flacTrackInfo.artists && flacTrackInfo.artists.length > 0) {
      tagOptions.push(`--ta "${flacTrackInfo.artists.join(', ')}"`);
    }

    if (flacTrackInfo.genre) {
      tagOptions.push(`--tg "${flacTrackInfo.genre}"`);
    }

    if (flacTrackInfo.year) {
      tagOptions.push(`--ty "${flacTrackInfo.year}"`);
    }

    if (flacTrackInfo.released) {
      tagOptions.push(`--tv TORY=${formatLocalDateToIsoDateString(flacTrackInfo.released)}`);
    }

    if (flacTrackInfo.album) {
      if (flacTrackInfo.album.title) {
        tagOptions.push(`--tl "${flacTrackInfo.album.title}"`);
      }

      if (flacTrackInfo.album.trackNumber) {
        let albumNumbers = flacTrackInfo.album.trackNumber.toString();

        if (flacTrackInfo.album.trackTotal) {
          albumNumbers += `/${flacTrackInfo.album.trackTotal.toString()}`;
        }

        tagOptions.push(`--tn "${albumNumbers}"`);
      }
    }

    // lame codec supports only front cover option:
    const exportedFlacPictures = BearTunesTagger.exportFlacPictureBlocks(
      flacFilePath,
      [FlacPictureBlockType.CoverFront],
    );

    if (exportedFlacPictures.length > 0) {
      tagOptions.push(`--ti "${exportedFlacPictures[0].imagePath}"`);
      result.temporaryFiles.push(...exportedFlacPictures.map((imageInfo) => imageInfo.imagePath));
    }

    // length > 1 means there is at least one tag entry to set (the fist one is --add-id3v2)
    result.lameTagOptions = (tagOptions.length > 1) ? tagOptions : [];

    if (this.options.verbose) {
      logger.info(`Using following tag options: ${result.lameTagOptions.join(' ')}`);
    }

    return result;
  }

  private static isBetterMatchingTrack(
    inputTrackInfo: TrackInfo,
    winner: MatchingTrack | undefined,
    candidateReleased: Date | undefined,
    candidateDuration: number,
    score: number,
  ): boolean {
    if (!winner) {
      return true;
    }

    const hasBetterScore = score > winner.score;

    const hasSameScoreButEarlierRelease = (
      score === winner.score
      && candidateReleased !== undefined
      && (!winner.released || candidateReleased < winner.released)
    );

    const currentDurationDistance = inputTrackInfo.details
      ? Math.abs(candidateDuration - inputTrackInfo.details.duration)
      : undefined;

    const winnerDurationDistance = inputTrackInfo.details && winner.details
      ? Math.abs(winner.details.duration - inputTrackInfo.details.duration)
      : undefined;

    const hasSameScoreButCloserDuration = (
      score === winner.score
      && currentDurationDistance !== undefined
      && winnerDurationDistance !== undefined
      && currentDurationDistance < winnerDurationDistance
    );

    return hasBetterScore
      || hasSameScoreButEarlierRelease
      || hasSameScoreButCloserDuration;
  }

  private static createMatchingTrack(
    trackInfo: TrackInfo,
    score: number,
    scoreKeywords: string[],
  ): MatchingTrack {
    return {
      url: trackInfo.url,
      artists: trackInfo.artists,
      title: trackInfo.title,
      remixers: trackInfo.remixers,
      released: trackInfo.released,
      genre: trackInfo.genre,
      subgenre: trackInfo.subgenre,
      bpm: trackInfo.bpm,
      isrc: trackInfo.isrc,
      details: trackInfo.details
        ? { duration: trackInfo.details.duration }
        : undefined,
      score,
      scoreKeywords,
    };
  }

  async findBestMatchingTrack(
    trackInfo: TrackInfo,
    inputKeywords: string[],
  ): Promise<MatchingTrack | undefined> {
    let winner: MatchingTrack | undefined;

    const trackArray = await fetchBeatportSearchTrackPayload(
      this.options.searchURL,
      inputKeywords,
    );

    if (!trackArray) {
      return undefined;
    }

    for (const trackEntry of trackArray) {
      const mappedTrackInfo = mapBeatportSearchResultTrackToTrackInfo(
        trackEntry,
        this.options.domainURL,
      );

      if (!mappedTrackInfo) {
        logger.warn('Cannot map Beatport search result track to TrackInfo', {
          trackId: trackEntry.track_id,
          trackName: trackEntry.track_name,
        });

        continue;
      }

      const parsedMappedTrackInfo = trackInfoSchema.safeParse(mappedTrackInfo, {
        reportInput: true,
      });

      if (!parsedMappedTrackInfo.success) {
        logger.warn('Cannot validate mapped TrackInfo from Beatport search result', {
          trackId: trackEntry.track_id,
          trackName: trackEntry.track_name,
          issues: formatZodErrorIssues(parsedMappedTrackInfo.error),
        });

        continue;
      }

      const candidateTrack = parsedMappedTrackInfo.data;

      if (!candidateTrack.title || !candidateTrack.artists?.length || !candidateTrack.details) {
        continue;
      }

      const trackKeywords = extractTrackNameKeywords(
        normalizeTextCharacters(`${candidateTrack.artists.join(' ')} ${candidateTrack.title}`),
      );

      const keywordsIntersection = arrayIntersection(
        arrayToLowerCase(inputKeywords),
        replacePathForbiddenCharsInArray(arrayToLowerCase(trackKeywords)),
      );

      const score = keywordsIntersection.length;

      if (!winner || BearTunesTagger.isBetterMatchingTrack(
        trackInfo,
        winner,
        candidateTrack.released,
        candidateTrack.details.duration,
        score,
      )) {
        winner = BearTunesTagger.createMatchingTrack(
          candidateTrack,
          score,
          keywordsIntersection,
        );
      }
    }

    return winner;
  }

  async extractTrackData(
    trackUrl: URL,
    forceRadioEdit: boolean,
  ): Promise<TrackInfo> {
    const trackData = await fetchBeatportTrackPayload(trackUrl);

    if (!trackData) {
      return {};
    }

    const publisher = await this.extractPublisherData(trackData.release.label);
    const album = await this.extractAlbumData(trackData.release, trackData.number);

    const mappedTrackInfo = mapBeatportTrackToTrackInfo(
      trackData,
      trackUrl,
      forceRadioEdit,
      album,
      publisher,
    );

    if (!mappedTrackInfo) {
      return {};
    }

    const parsedTrackInfo = trackInfoSchema.safeParse(mappedTrackInfo, {
      reportInput: true,
    });

    if (!parsedTrackInfo.success) {
      logger.warn('Cannot validate normalized TrackInfo extracted from Beatport API', {
        trackUrl: trackUrl.toString(),
        issues: formatZodErrorIssues(parsedTrackInfo.error),
      });

      return {};
    }

    return parsedTrackInfo.data;
  }

  async extractAlbumData(
    releaseInfo: BeatportReleaseInfo,
    trackNumber: number,
  ): Promise<AlbumInfo | undefined> {
    const beatportAlbumPayload = await fetchBeatportAlbumPayload(
      this.options.domainURL,
      releaseInfo,
    );

    if (!beatportAlbumPayload) {
      return undefined;
    }

    const mappedAlbumInfo = mapBeatportAlbumToAlbumInfo(
      beatportAlbumPayload.albumData,
      beatportAlbumPayload.albumUrl,
      trackNumber,
    );

    if (!mappedAlbumInfo) {
      return undefined;
    }

    const parsedAlbumInfo = albumInfoSchema.safeParse(mappedAlbumInfo, {
      reportInput: true,
    });

    if (!parsedAlbumInfo.success) {
      logger.warn('Cannot validate normalized AlbumInfo extracted from Beatport API', {
        albumUrl: beatportAlbumPayload.albumUrl.toString(),
        issues: formatZodErrorIssues(parsedAlbumInfo.error),
      });

      return undefined;
    }

    return parsedAlbumInfo.data;
  }

  async extractPublisherData(
    labelInfo: BeatportLabelInfo,
  ): Promise<PublisherInfo | undefined> {
    const beatportPublisherPayload = await fetchBeatportPublisherPayload(
      this.options.domainURL,
      labelInfo,
    );

    if (!beatportPublisherPayload) {
      return undefined;
    }

    const mappedPublisherInfo = mapBeatportPublisherToPublisherInfo(
      beatportPublisherPayload.publisherData,
      beatportPublisherPayload.publisherUrl,
    );

    if (!mappedPublisherInfo) {
      return undefined;
    }

    const parsedPublisherInfo = publisherInfoSchema.safeParse(mappedPublisherInfo, {
      reportInput: true,
    });

    if (!parsedPublisherInfo.success) {
      logger.warn('Cannot validate normalized PublisherInfo extracted from Beatport API', {
        publisherUrl: beatportPublisherPayload.publisherUrl.toString(),
        issues: formatZodErrorIssues(parsedPublisherInfo.error),
      });

      return undefined;
    }

    return parsedPublisherInfo.data;
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
      const filename = await downloadImage(imageUrl, USER_AGENT_CACHE_FILE, {
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

  /**
   * Removes temporary artwork files created while preparing track tags.
   *
   * The cleanup is best-effort: a failure to remove one file is logged and does
   * not prevent cleanup of the remaining files or affect the result of the
   * tagging operation.
   *
   * @param imagePaths - Paths of temporary artwork files to remove. Undefined
   * entries are ignored.
   */
  static cleanupTrackArtworkFiles(imagePaths: TrackArtworkFiles): void {
    Object.values(imagePaths).forEach((imagePath) => {
      if (imagePath !== undefined) {
        try {
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
        } catch (error: unknown) {
          logger.warn(`Failed to remove temporary artwork file: ${imagePath}`, { error });
        }
      }
    });
  }

  async saveTagToMp3File(trackPath: string, trackData: TrackInfo, { id3v2 = true, id3v1 = true, verbose = false } = {}): Promise<void> {
    const imagePaths: TrackArtworkFiles = {};

    try {
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
        eyeD3Options.push('--artist', trackData.artists.join(', '));
        // '--artist', trackData.artists.replace('ø', 'o'),
      }
      if (trackData.title) {
        // eyeD3Options.push('--title', trackData.title.replace(/^-/, '- '));
        eyeD3Options.push('--text-frame', `TIT2:${escapeUnescapedColons(trackData.title)}`); // --title option with a parameter starting with a hyphen (-) will cause eyeD3 to report the usage error
      }
      if (trackData.remixers && trackData.remixers.length > 0) {
        eyeD3Options.push('--text-frame', `TPE4:${escapeUnescapedColons(trackData.remixers.join(', '))}`); // TPE4 => REMIXEDBY
      }
      if (trackData.album?.title) {
        // eyeD3Options.push('--album', trackData.album.title.replace(/^-/, '- '));
        eyeD3Options.push('--text-frame', `TALB:${escapeUnescapedColons(trackData.album.title)}`); // the same as with --title
      }
      if (trackData.album?.artists && trackData.album.artists.length > 0) {
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
          this.options.eyed3Verbose,
        );

        BearTunesTagger.executeEyeD3Tool(
          ID3Version.ID3v2_4,
          eyeD3Options,
          `MP3 ID3v${ID3Version.ID3v2_4} tag was saved to "${trackFilename}"`,
          this.options.eyed3Verbose,
        );
      }

      if (id3v1) {
        BearTunesTagger.executeEyeD3Tool(
          ID3Version.ID3v1_1,
          eyeD3Options,
          `MP3 ID3v${ID3Version.ID3v1_1} tag was saved to "${trackFilename}"`,
          this.options.eyed3Verbose,
        );
      }
    } catch (error: unknown) {
      throw new TaggerGuardError(
        BearTunesTaggerFailureCode.TagWriteFailed,
        new Error(
          `${this.constructor.name} Cannot save tag to MP3 file ${path.basename(trackPath)}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    } finally {
      BearTunesTagger.cleanupTrackArtworkFiles(imagePaths);
    }
  }

  /**
   * Executes eyeD3 with the requested ID3 version and command-line options.
   *
   * Logs either the tool output or the supplied success message, depending on
   * the verbose flag. Command execution failures are intentionally propagated
   * to the caller so the enclosing tag write operation can handle them.
   *
   * @param version - ID3 version written by eyeD3.
   * @param options - Additional eyeD3 command-line options, including the input file path.
   * @param successMessage - Message logged when the command completes and verbose logging is disabled.
   * @param verbose - Whether to log eyeD3 standard output instead of the success message.
   * @throws Error When eyeD3 cannot be executed or exits unsuccessfully.
   */
  static executeEyeD3Tool(
    version: ID3Version,
    options: string[],
    successMessage: string,
    verbose = false,
  ): void {
    const result = executeCommandSync(
      'eyeD3',
      [
        '--v2',
        `--to-v${version.toString()}`, // overwrite other versions of id3
        ...options,
      ],
    );

    logger.info(verbose ? result.stdout : successMessage);
  }

  async saveTagToFlacFile(trackPath: string, trackData: TrackInfo, { verbose = false } = {}): Promise<void> {
    const imagePaths: TrackArtworkFiles = {};

    try {
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

      if (trackData.album?.artists && trackData.album.artists.length > 0) {
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
          this.options.metaflacVerbose,
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

      BearTunesTagger.executeMetaflacTool(metaflacOptions, `FLAC tag was saved to "${path.basename(trackPath)}"`, this.options.metaflacVerbose);
    } catch (error: unknown) {
      throw new TaggerGuardError(
        BearTunesTaggerFailureCode.TagWriteFailed,
        new Error(
          `${this.constructor.name} Cannot save tag to FLAC file ${path.basename(trackPath)}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    } finally {
      BearTunesTagger.cleanupTrackArtworkFiles(imagePaths);
    }
  }

  static addMetaflacTaggingOption(optionArray: string[], tagName: string, tagValue: string): void {
    optionArray.push(`--remove-tag=${tagName}`);
    optionArray.push(`--set-tag=${tagName}=${tagValue}`);
  }

  /**
   * Executes metaflac with the requested command-line options.
   *
   * Adds the common metadata-preservation options before executing metaflac.
   * Logs either the tool output or the supplied success message, depending on
   * the verbose flag. Command execution failures are intentionally propagated
   * to the caller so the enclosing tag write operation can handle them.
   *
   * @param options - Additional metaflac command-line options, including the input file path.
   * @param successMessage - Message logged when the command completes and verbose logging is disabled.
   * @param verbose - Whether to log metaflac standard output instead of the success message.
   * @throws Error When metaflac cannot be executed or exits unsuccessfully.
   */
  static executeMetaflacTool(
    options: string[],
    successMessage: string,
    verbose = false,
  ): void {
    const result = executeCommandSync(
      'metaflac',
      [
        '--preserve-modtime',
        '--dont-use-padding',
        ...options,
      ],
    );

    logger.info(verbose ? result.stdout : successMessage);
  }
}
