/**
 * Error codes classifying renamer failures.
 */
export enum BearTunesRenamerFailureCode {
  // 300-309: rename preparation

  /** The rename pattern contains an unsupported placeholder. */
  UnsupportedRenamePatternPlaceholder = 301,

  /** A required TrackInfo property used by a pattern was not defined. */
  MissingTrackInfoValue = 302,

  /** The provided target directory path is not a directory. */
  InvalidTargetDirectory = 303,

  /** The target directory could not be accessed or created. */
  TargetDirectoryAccessError = 304,

  /** An unexpected error occurred while preparing the rename operation. */
  UnexpectedPreparationError = 305,

  /** A placeholder resolved to a whole object value, which is not supported. */
  ObjectTrackInfoValueNotSupported = 306,

  // 310-319: rename execution

  /** Renaming or moving the track file failed. */
  RenameOperationFailed = 311,
}

/**
 * Result returned when a rename operation completes successfully.
 */
export interface BearTunesRenamerSuccessResult {
  /** Discriminator indicating that the rename operation succeeded. */
  ok: true;

  /** Resolved target path of the renamed file. */
  targetPath: string;
}

/**
 * Result returned when a rename operation fails.
 */
export interface BearTunesRenamerFailureResult {
  /** Discriminator indicating that the rename operation failed. */
  ok: false;

  /** Domain-specific code classifying the rename failure. */
  failureCode: BearTunesRenamerFailureCode;

  /** Error object describing the failure cause. */
  error: Error;
}

/**
 * Discriminated union describing the outcome of a rename operation.
 *
 * When `ok` is `true`, the result is a {@link BearTunesRenamerSuccessResult}
 * and contains the resolved `targetPath`.
 *
 * When `ok` is `false`, the result is a {@link BearTunesRenamerFailureResult}
 * and contains `failureCode` together with the underlying `error`.
 */
export type BearTunesRenamerResult =
  | BearTunesRenamerSuccessResult
  | BearTunesRenamerFailureResult;

/**
 * Configuration options controlling BearTunes file renaming.
 */
export interface BearTunesRenamerOptions {
  /** Pattern used to build the target file name without extension. */
  filenamePattern: string;

  /** Pattern used to build the target directory. */
  directoryPattern: string;

  /** Whether verbose logging is enabled. */
  verbose: boolean;
}
