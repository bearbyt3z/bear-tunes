import type {
  DataProvider,
} from '#data-provider';
import type { TrackInfo } from '#shared-types';

/**
 * Failure codes returned by BearTunes tagger operations.
 */
export enum BearTunesTaggerFailureCode {
  // 400-409: input validation

  /**
   * The input file could not be accessed or inspected.
   */
  InputFileAccessError = 401,

  /**
   * The input file is not a supported audio format for the requested operation.
   */
  UnsupportedAudioFileType = 402,

  // 410-419: tag reading

  /**
  * Executing the MP3 tag reader to read tags from an MP3 file failed.
  */
  ID3TagReadExecutionFailed = 411,

  /**
  * Executing the `metaflac` tool to read tags from a FLAC file failed.
  */
  MetaflacTagReadExecutionFailed = 412,

  /**
  * Tag reader output could not be parsed, normalized, or validated.
  */
  TagReadOutputInvalid = 413,

  // 420-429: tag writing

  /**
   * Executing the `eyeD3` tool to write tags to an MP3 file failed.
   */
  EyeD3TagWriteExecutionFailed = 421,

  /**
   * Executing the `metaflac` tool to write tags to a FLAC file failed.
   */
  MetaflacTagWriteExecutionFailed = 422,

  /**
   * The input audio file type does not match the format required by the tag writer.
   */
  TagWriteInputFileTypeMismatch = 423,

  /**
   * Artwork could not be downloaded from its declared URL.
   */
  ArtworkDownloadFailed = 424,

  /**
  * Artwork file could not be validated or is not supported for tag embedding.
  */
  ArtworkValidationFailed = 425,

  // 430-439: remote track resolution

  /**
   * The companion URL file could not be read.
   */
  TrackUrlFileReadFailed = 431,

  /**
   * The companion URL file does not contain a valid track URL.
   */
  TrackUrlFileInvalid = 432,

  /**
   * Matching the local track with a remote track failed.
   */
  TrackMatchFailed = 433,

  /**
   * A candidate remote track was rejected during interactive matching.
   */
  TrackMatchRejected = 434,

  /**
   * Metadata for the selected remote track could not be retrieved or validated.
   */
  TrackDataFetchFailed = 435,

  /**
   * A request for metadata of the selected remote track failed.
   */
  TrackDataRequestFailed = 436,

  // 440-449: unexpected errors

  /**
   * An unexpected error occurred while preparing a tagger operation.
   */
  UnexpectedPreparationError = 441,

  /**
   * An unexpected error occurred while executing a tagger operation.
   */
  UnexpectedExecutionError = 442,
}

/**
 * Successful result returned by a BearTunes tagger operation.
 */
export interface BearTunesTaggerSuccessResult {
  /**
   * Indicates that the operation completed successfully.
   */
  ok: true;

  /**
   * Track metadata read, resolved, or written by the operation.
   */
  trackInfo: TrackInfo;
}

/**
 * Failed result returned by a BearTunes tagger operation.
 */
export interface BearTunesTaggerFailureResult {
  /**
   * Indicates that the operation did not complete successfully.
   */
  ok: false;

  /**
   * Domain-specific code classifying the failure.
   */
  failureCode: BearTunesTaggerFailureCode;

  /**
   * Error describing the failure cause.
   */
  error: Error;

  /**
   * Optional structured diagnostic details for logging or error reporting.
   *
   * For validation failures, this may include formatted schema issues.
   */
  details?: Record<string, unknown>;
}

/**
 * Result returned by a BearTunes tagger operation.
 */
export type BearTunesTaggerResult =
  | BearTunesTaggerSuccessResult
  | BearTunesTaggerFailureResult;

/**
 * Configuration controlling metadata resolution and tag writing performed by
 * BearTunesTagger.
 */
export interface BearTunesTaggerOptions {
  /**
   * Data provider used to search remote track candidates and resolve canonical
   * metadata for selected tracks.
   */
  defaultDataProvider: DataProvider;

  /**
   * Path to the eyeD3 display-plugin pattern file used while reading MP3 tags.
   */
  eyeD3DisplayPluginPatternFile: string;

  /**
   * Maximum accepted duration difference, in seconds, between local and remote
   * track metadata before user confirmation is requested.
   */
  lengthDifferenceAccepted: number;

  /**
   * Enables diagnostic log messages emitted by the tagger.
   */
  verbose: boolean;

  /**
   * Enables verbose output from eyeD3 commands.
   */
  eyed3Verbose?: boolean;

  /**
   * Enables verbose output from metaflac commands.
   */
  metaflacVerbose?: boolean;
}

/**
 * Resolution selected for a significant duration mismatch between a local
 * track and the selected remote track.
 *
 * @internal
 */
export type TrackDurationMismatchResolution =
  | 'keep-match'
  | 'use-radio-edit'
  | 'skip-match';

/**
 * Internal candidate track selected while matching local metadata against
 * remote provider search results.
 *
 * @internal
 */
export interface MatchingTrack extends TrackInfo {
  score: number;
  readonly scoreKeywords: readonly string[];
  url?: URL;
}

/**
 * Paths of temporary artwork files used during internal tag-writing flows.
 *
 * @internal
 */
export interface TrackArtworkFiles {
  frontCover?: string; // TODO: File?
  waveform?: string;
  publisherLogotype?: string;
}

/**
 * ID3 tag versions supported by the internal eyeD3 integration.
 *
 * @internal
 */
export enum ID3Version {
  ID3v1_0 = '1.0',
  ID3v1_1 = '1.1',
  ID3v2_3 = '2.3',
  ID3v2_4 = '2.4',
}

/**
 * Options for downloading an image asset with optional source page context.
 *
 * @internal
 *
 * @property imageUrl - Image URL to download. The property is required, but its value may be `undefined`.
 * @property sourcePageUrl - Optional URL of the page from which the image asset originates.
 * @property label - Human-readable asset label used in log messages.
 * @property verbose - Enables additional diagnostic logging.
 */
export interface DownloadImageAssetOptions {
  imageUrl: URL | undefined;
  sourcePageUrl?: URL;
  label: string;
  verbose?: boolean;
}

/**
 * FLAC PICTURE block type values defined by the FLAC format specification.
 *
 * These numeric identifiers are used by `metaflac` when listing or exporting
 * embedded picture blocks from a FLAC file.
 *
 * @see https://xiph.org/flac/format.html
 *
 * @internal
 */
export enum FlacPictureBlockType {
  FileIcon = 1, // 32x32 PNG only
  CoverFront = 3,
  CoverBack = 4,
  BrightColouredFish = 17,
  PublisherLogotype = 20,
}

/**
 * Metadata describing a PICTURE block embedded in a FLAC file.
 *
 * `metadataBlockNumber` identifies the physical FLAC metadata block and is
 * used with `metaflac --block-number`. `pictureType` identifies the semantic
 * role declared inside that PICTURE block, such as front cover or publisher
 * logotype.
 *
 * @internal
 */
export interface FlacPictureBlockInfo {
  /**
   * Zero-based position of this metadata block in the FLAC metadata chain.
   *
   * This value is specific to the file layout and must be used when exporting
   * the block through `metaflac --block-number`.
   */
  metadataBlockNumber: number;

  /** Semantic PICTURE type declared by the FLAC PICTURE block. */
  pictureType: FlacPictureBlockType;

  /** MIME type declared by the FLAC PICTURE block. */
  mimeType: string;
}

/**
 * Metadata of a FLAC PICTURE block exported to a temporary image file.
 *
 * @internal
 */
export interface ExportedFlacPictureBlock extends FlacPictureBlockInfo {
  /** Path of the exported image file. */
  imagePath: string;
}

/**
 * Prepared metadata transfer payload for FLAC-to-MP3 conversion.
 *
 * @internal
 *
 * @property lameTagOptions - `lame` CLI options used to write MP3 tag fields
 * derived from the source FLAC metadata.
 * @property temporaryFiles - Paths of temporary files created during transfer
 * preparation, intended to be removed after conversion completes.
 */
export interface PreparedMp3TagTransfer {
  lameTagOptions: string[];
  temporaryFiles: string[];
}
