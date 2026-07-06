import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '#logger';
import {
  isObjectRecord,
  normalizeUnknownError,
  replacePathForbiddenChars,
} from '#tools';

import {
  RenamerGuardError,
} from './errors.js';
import {
  BearTunesRenamerDirectoryPatternMode,
  BearTunesRenamerFailureCode,
} from './types.js';

import type {
  BearTunesRenamerFailureResult,
  BearTunesRenamerOptions,
  BearTunesRenamerResult,
  BearTunesRenamerSuccessResult,
} from './types.js';
import type { TrackInfo } from '#shared-types';

// reexporting enum & types, so they will be included in the renamer module import
export {
  BearTunesRenamerDirectoryPatternMode,
  BearTunesRenamerFailureCode,
};

export type {
  BearTunesRenamerFailureResult,
  BearTunesRenamerOptions,
  BearTunesRenamerResult,
  BearTunesRenamerSuccessResult,
};

/**
 * Default renamer options applied when custom options are not provided.
 */
// Default options are intentionally defined as immutable:
// - `as const` keeps exact literal types and readonly fields,
// - `satisfies` checks compatibility with the public options type,
// - `Object.freeze()` guards against accidental mutation at runtime.
const defaultRenamerOptions = Object.freeze({
  filenamePattern: '%artists% - %title%', // title already contains remixers etc.
  directoryPattern: '%genre%/%artists%',
  directoryPatternMode: BearTunesRenamerDirectoryPatternMode.RequiresTargetBaseDirectory,
  verbose: false,
} as const satisfies BearTunesRenamerOptions);

export class BearTunesRenamer {
  /**
   * Effective renamer configuration for this instance.
   */
  private readonly options: BearTunesRenamerOptions;

  /**
   * Creates a renamer instance with merged default and custom options.
   *
   * @param options - Partial renamer configuration overriding default values.
   */
  constructor(options: Partial<BearTunesRenamerOptions> = {}) {
    this.options = {
      ...defaultRenamerOptions,
      ...options,
    };
  }

  /**
   * Creates a success result describing a completed rename operation.
   *
   * @param targetPath - Resolved target path of the renamed file.
   * @returns A renamer success result with `ok` set to `true`.
   */
  private static createSuccessResult(targetPath: string): BearTunesRenamerSuccessResult {
    return { ok: true, targetPath };
  }

  /**
   * Creates a failure result describing an unsuccessful rename operation.
   *
   * @param failureCode - Domain-specific code classifying the rename failure.
   * @param error - Error object describing the failure cause.
   * @returns A renamer failure result with `ok` set to `false`.
   */
  private static createFailureResult(
    failureCode: BearTunesRenamerFailureCode,
    error: Error,
  ): BearTunesRenamerFailureResult {
    return { ok: false, failureCode, error };
  }

  /**
   * Resolves a placeholder path against TrackInfo metadata.
   *
   * The placeholder path may reference a top-level TrackInfo property
   * such as `title` or a nested property such as `album.title`.
   * Nested traversal is supported only through object properties;
   * array elements cannot be addressed through placeholder segments.
   *
   * @param placeholderPath - Dot-separated placeholder path without `%` markers.
   * @param trackInfo - Track metadata providing values for the placeholder.
   * @returns The resolved TrackInfo value for the placeholder path.
   * @throws {RenamerGuardError} When the placeholder path is empty or
   * references an unsupported TrackInfo property.
   */
  private static resolvePlaceholderValue(
    placeholderPath: string,
    trackInfo: TrackInfo,
  ): unknown {
    if (!placeholderPath) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.UnsupportedRenamePatternPlaceholder,
        new TypeError(
          `${this.name}: Unsupported rename pattern placeholder: %%`,
        ),
      );
    }

    const segments = placeholderPath.split('.');
    let current: unknown = trackInfo;

    for (const segment of segments) {
      if (Array.isArray(current)) {
        throw new RenamerGuardError(
          BearTunesRenamerFailureCode.UnsupportedRenamePatternPlaceholder,
          new TypeError(
            `${this.name}: Unsupported rename pattern placeholder: %${placeholderPath}%`,
          ),
        );
      }

      if (!isObjectRecord(current) || !Object.hasOwn(current, segment)) {
        throw new RenamerGuardError(
          BearTunesRenamerFailureCode.UnsupportedRenamePatternPlaceholder,
          new TypeError(
            `${this.name}: Unsupported rename pattern placeholder: %${placeholderPath}%`,
          ),
        );
      }

      current = current[segment];
    }

    return current;
  }

  /**
   * Replaces placeholders used in a rename pattern with TrackInfo values.
   *
   * The method replaces placeholders such as `%title%`, `%artists%`,
   * or `%album.title%` with values read from the provided track metadata.
   * Array values are joined with commas. String values are returned as-is.
   * Number, boolean, and bigint values are converted to strings. Whole-object
   * values are rejected because placeholders must resolve to a direct
   * replacement value.
   *
   * @param pattern - Pattern containing TrackInfo-based placeholders.
   * @param trackInfo - Track metadata providing values for placeholders.
   * @returns The pattern with all supported placeholders replaced by resolved
   * TrackInfo values.
   * @throws {RenamerGuardError} When the pattern contains an unsupported
   * placeholder, when a required TrackInfo value is missing, when a
   * placeholder resolves to a whole object value, or when it resolves
   * to an unsupported runtime value.
   */
  private static replacePatternPlaceholders(pattern: string, trackInfo: TrackInfo): string {
    return pattern.replace(/%(?:\w+\.)*\w+%/ig, (match) => {
      const placeholderPath = match.slice(1, -1);
      const value = BearTunesRenamer.resolvePlaceholderValue(placeholderPath, trackInfo);

      if (value === undefined) {
        throw new RenamerGuardError(
          BearTunesRenamerFailureCode.MissingTrackInfoValue,
          new Error(
            `${this.name}: Missing TrackInfo value for placeholder %${placeholderPath}%`,
          ),
        );
      }

      if (Array.isArray(value)) {
        return value.join(', ');
      }

      if (isObjectRecord(value)) {
        throw new RenamerGuardError(
          BearTunesRenamerFailureCode.ObjectTrackInfoValueNotSupported,
          new TypeError(
            `${this.name}: Placeholder %${placeholderPath}% cannot be resolved from an object value`,
          ),
        );
      }

      if (typeof value === 'string') {
        return value;
      }

      if (
        typeof value === 'number'
        || typeof value === 'boolean'
        || typeof value === 'bigint'
      ) {
        return String(value);
      }

      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.UnexpectedPreparationError,
        new TypeError(
          `${this.name}: Placeholder %${placeholderPath}% resolved to an unsupported runtime value`,
        ),
      );
    });
  }

  /**
   * Asserts that the target directory base path is accessible and points to a directory.
   *
   * This helper acts as a fail-fast guard for target directory resolution
   * preconditions. It aborts the current rename preparation flow by throwing
   * {@link RenamerGuardError} when the target directory base path cannot be
   * accessed or does not point to a directory.
   *
   * If the method returns normally, the caller may continue target directory
   * resolution assuming that the base directory precondition has been satisfied.
   *
   * @param targetDirectoryBasePath - Base directory path to assert.
   * @throws {RenamerGuardError} When the path is inaccessible or does not point
   * to a directory.
   */
  private assertValidTargetDirectoryBasePath(targetDirectoryBasePath: string): void {
    let targetDirectoryBasePathStats: fs.Stats;

    try {
      targetDirectoryBasePathStats = fs.lstatSync(targetDirectoryBasePath);
    } catch (error) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.TargetDirectoryAccessError,
        new Error(
          `${this.constructor.name}: Cannot access target base directory path ${targetDirectoryBasePath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    if (!targetDirectoryBasePathStats.isDirectory()) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.InvalidTargetDirectory,
        new TypeError(
          `${this.constructor.name}: Specified target base directory path ${targetDirectoryBasePath} is not a directory`,
        ),
      );
    }
  }

  /**
   * Resolves the final target directory path from an already selected base path.
   *
   * The method normalizes the provided base directory path, applies the
   * configured `directoryPattern` using track metadata, sanitizes the resulting
   * path segments, and combines them into the final target directory path.
   *
   * @param targetDirectoryBasePath - Base directory path for target directory resolution.
   * @param trackInfo - Track metadata used to replace directory placeholders.
   * @returns The resolved target directory path derived from the base path.
   * @throws {RenamerGuardError} When replacing directory pattern placeholders fails.
   */
  private resolveTargetDirectoryPathFromBasePath(
    targetDirectoryBasePath: string,
    trackInfo: TrackInfo,
  ): string {
    const normalizedTargetDirectoryBasePath = targetDirectoryBasePath.replace(/[/\\]+$/, path.sep);
    const replacedDirectoryPattern = BearTunesRenamer.replacePatternPlaceholders(
      this.options.directoryPattern,
      trackInfo,
    );

    const sanitizedTargetDirectorySegments = replacedDirectoryPattern
      .split(/[/\\]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => replacePathForbiddenChars(segment));

    return sanitizedTargetDirectorySegments.length > 0
      ? path.join(normalizedTargetDirectoryBasePath, ...sanitizedTargetDirectorySegments)
      : normalizedTargetDirectoryBasePath;
  }

  /**
   * Resolves the target directory path to use for a rename operation.
   *
   * When `directoryPatternMode` is set to
   * {@link BearTunesRenamerDirectoryPatternMode.RequiresTargetBaseDirectory},
   * the configured `directoryPattern` is applied only if the caller provides
   * `targetBaseDirectory`. Otherwise the source track directory is returned.
   *
   * When `directoryPatternMode` is set to
   * {@link BearTunesRenamerDirectoryPatternMode.Always},
   * `directoryPattern` is always applied. The provided `targetBaseDirectory`
   * is used as the base directory when available; otherwise the source track
   * directory is used as the base directory.
   *
   * When a directory pattern is applied, the method validates the selected base
   * directory, resolves the final target directory path from that base path and
   * track metadata, creates missing target directories, and returns the resolved
   * target directory path.
   *
   * @param trackPath - Path to the source track file.
   * @param targetBaseDirectory - Optional base directory provided by the caller.
   * @param trackInfo - Track metadata used to replace directory placeholders.
   * @returns The resolved target directory path.
   * @throws {RenamerGuardError} When the selected base directory is invalid,
   * inaccessible, or cannot be used to create the resolved target directory.
   */
  private resolveTargetDirectoryPath(
    trackPath: string,
    targetBaseDirectory: string | undefined,
    trackInfo: TrackInfo,
  ): string {
    if (
      this.options.directoryPatternMode === BearTunesRenamerDirectoryPatternMode.RequiresTargetBaseDirectory
      && targetBaseDirectory === undefined
    ) {
      return path.dirname(trackPath);
    }

    const targetDirectoryBasePath = targetBaseDirectory ?? path.dirname(trackPath);

    this.assertValidTargetDirectoryBasePath(targetDirectoryBasePath);

    const resolvedTargetDirectory = this.resolveTargetDirectoryPathFromBasePath(
      targetDirectoryBasePath,
      trackInfo,
    );

    try {
      fs.mkdirSync(resolvedTargetDirectory, { recursive: true });
    } catch (error) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.TargetDirectoryAccessError,
        new Error(
          `${this.constructor.name}: Cannot create target directory ${resolvedTargetDirectory}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    return resolvedTargetDirectory;
  }

  /**
   * Builds the target file name for a rename operation.
   *
   * The method replaces placeholders in the configured filename pattern using
   * track metadata, preserves the original file extension, and sanitizes the
   * resulting file name so it can be safely used in the filesystem.
   *
   * @param trackPath - Path to the source track file.
   * @param trackInfo - Track metadata used to replace filename placeholders.
   * @returns The sanitized target file name including the original extension.
   * @throws {RenamerGuardError} When replacing filename placeholders fails.
   */
  private buildTargetFilename(
    trackPath: string,
    trackInfo: TrackInfo,
  ): string {
    return replacePathForbiddenChars(
      BearTunesRenamer.replacePatternPlaceholders(this.options.filenamePattern, trackInfo)
      + path.extname(trackPath),
    );
  }

  /**
   * Resolves the final target file path for a rename operation.
   *
   * The method builds the target file name, resolves the target directory,
   * and combines both parts into the final destination path.
   *
   * @param trackPath - Path to the source track file.
   * @param targetBaseDirectory - Optional base target directory provided by the caller.
   * @param trackInfo - Track metadata used to replace placeholders.
   * @returns The final target path for the rename operation.
   * @throws {RenamerGuardError} When target path preparation fails.
   */
  private resolveTargetPath(
    trackPath: string,
    targetBaseDirectory: string | undefined,
    trackInfo: TrackInfo,
  ): string {
    const filename = this.buildTargetFilename(
      trackPath,
      trackInfo,
    );

    const resolvedTargetDirectory = this.resolveTargetDirectoryPath(
      trackPath,
      targetBaseDirectory,
      trackInfo,
    );

    return path.join(resolvedTargetDirectory, filename);
  }

  /**
   * Executes the filesystem rename step for a prepared target path.
   *
   * @param trackPath - Path to the source track file.
   * @param targetPath - Final target path for the renamed file.
   * @throws {RenamerGuardError} When the filesystem rename operation fails.
   */
  private executeRenameOperation(
    trackPath: string,
    targetPath: string,
  ): void {
    try {
      fs.renameSync(trackPath, targetPath);
    } catch (error) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.RenameOperationFailed,
        new Error(
          `${this.constructor.name}: Failed to rename ${trackPath} to ${targetPath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }
  }

  /**
   * Renames or moves a track file according to the configured renamer patterns.
   *
   * The method prepares the final target path from the provided track metadata
   * and optional target base directory, executes the filesystem rename operation,
   * and returns a discriminated result describing either success or failure.
   *
   * @param trackPath - Path to the source track file.
   * @param trackInfo - Track metadata used to build the target path.
   * @param targetBaseDirectory - Optional base target directory provided by the caller.
   * @returns A renamer result describing either the resolved target path or the
   * classified failure.
   */
  rename(
    trackPath: string,
    trackInfo: TrackInfo,
    targetBaseDirectory?: string,
  ): BearTunesRenamerResult {
    let targetPath: string;

    try {
      targetPath = this.resolveTargetPath(
        trackPath,
        targetBaseDirectory,
        trackInfo,
      );
    } catch (error) {
      if (error instanceof RenamerGuardError) {
        return BearTunesRenamer.createFailureResult(
          error.failureCode,
          error.cause,
        );
      }

      return BearTunesRenamer.createFailureResult(
        BearTunesRenamerFailureCode.UnexpectedPreparationError,
        normalizeUnknownError(error),
      );
    }

    try {
      this.executeRenameOperation(trackPath, targetPath);
    } catch (error) {
      if (error instanceof RenamerGuardError) {
        return BearTunesRenamer.createFailureResult(
          error.failureCode,
          error.cause,
        );
      }

      return BearTunesRenamer.createFailureResult(
        BearTunesRenamerFailureCode.RenameOperationFailed,
        normalizeUnknownError(error),
      );
    }

    if (this.options.verbose) {
      logger.info(`Track file moved to: "${targetPath}"`);
    }

    return BearTunesRenamer.createSuccessResult(targetPath);
  }
}
