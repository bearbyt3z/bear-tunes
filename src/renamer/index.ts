import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '#logger';
import {
  normalizeUnknownError,
  replacePathForbiddenChars,
} from '#tools';

import {
  RenamerGuardError,
} from './errors.js';
import {
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
  BearTunesRenamerFailureCode,
};

export type {
  BearTunesRenamerFailureResult,
  BearTunesRenamerOptions,
  BearTunesRenamerResult,
  BearTunesRenamerSuccessResult,
};

// Default options are intentionally defined as immutable:
// - `as const` keeps exact literal types and readonly fields,
// - `satisfies` checks compatibility with the public options type,
// - `Object.freeze()` guards against accidental mutation at runtime.
const defaultRenamerOptions = Object.freeze({
  filenamePattern: '%artists% - %title%', // title already contains remixers etc.
  directoryPattern: '%genre%/%artists%',
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
   * Replaces placeholders used in a rename pattern with TrackInfo values.
   *
   * The method replaces placeholders such as `%title%` or `%artists%`
   * with values read from the provided track metadata. Array values are
   * joined with commas, plain objects are JSON-stringified when possible,
   * and primitive values are converted to strings.
   *
   * @param pattern - Pattern containing TrackInfo-based placeholders.
   * @param trackInfo - Track metadata providing values for placeholders.
   * @returns The pattern with all placeholders replaced by TrackInfo values.
   * @throws {RenamerGuardError} When the pattern contains an invalid
   * placeholder or when a required TrackInfo value is missing.
   */
  private static replacePatternPlaceholders(pattern: string, trackInfo: TrackInfo): string {
    return pattern.replace(/%\w+%/ig, (match) => {
      const keyName = match.replace(/%/g, '');

      if (!keyName || !(keyName in trackInfo)) {
        throw new RenamerGuardError(
          BearTunesRenamerFailureCode.InvalidRenamePatternPlaceholder,
          new TypeError(
            `${this.name}: Rename pattern contains illegal property name: ${keyName}`,
          ),
        );
      }

      const key = keyName as keyof TrackInfo;
      const value = trackInfo[key];

      if (value === undefined) {
        throw new RenamerGuardError(
          BearTunesRenamerFailureCode.MissingTrackInfoValue,
          new ReferenceError(
            `${this.name}: Missing TrackInfo value for placeholder %${keyName}%`,
          ),
        );
      }

      if (Array.isArray(value)) {
        return value.join(', ');
      }

      if (typeof value === 'object' && value !== null) {
        try {
          return JSON.stringify(value);
        } catch {
          return '[Unserializable object]';
        }
      }

      return String(value);
    });
  }

  /**
   * Resolves the target directory path to use for a rename operation.
   *
   * When `targetDirectory` is not provided, the method returns the current
   * directory of the source track. Otherwise it validates the provided target
   * directory, replaces placeholders in the configured directory pattern using
   * track metadata, sanitizes the path, creates missing directories, and returns
   * the resolved target directory path.
   *
   * @param trackPath - Path to the source track file.
   * @param targetDirectory - Optional base target directory provided by the caller.
   * @param trackInfo - Track metadata used to replace directory placeholders.
   * @returns The resolved target directory path.
   * @throws {RenamerGuardError} When the target directory is invalid,
   * inaccessible, or cannot be created.
   */
  private resolveTargetDirectoryPath(
    trackPath: string,
    targetDirectory: string | undefined,
    trackInfo: TrackInfo,
  ): string {
    if (targetDirectory === undefined) {
      return path.dirname(trackPath);
    }

    let targetDirectoryStats: fs.Stats;

    try {
      targetDirectoryStats = fs.lstatSync(targetDirectory);
    } catch (error) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.TargetDirectoryAccessError,
        new ReferenceError(
          `${this.constructor.name}: Cannot access target directory path ${targetDirectory}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    if (!targetDirectoryStats.isDirectory()) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.InvalidTargetDirectory,
        new TypeError(
          `${this.constructor.name}: Specified target directory path ${targetDirectory} is not a directory`,
        ),
      );
    }

    const normalizedTargetDirectory = targetDirectory.replace(/[/\\]+$/, path.sep);
    const replacedDirectoryPattern = BearTunesRenamer.replacePatternPlaceholders(this.options.directoryPattern, trackInfo);

    const sanitizedTargetDirectorySegments = replacedDirectoryPattern
      .split(/[/\\]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => replacePathForbiddenChars(segment));

    const resolvedTargetDirectory = sanitizedTargetDirectorySegments.length > 0
      ? path.join(normalizedTargetDirectory, ...sanitizedTargetDirectorySegments)
      : normalizedTargetDirectory;

    try {
      fs.mkdirSync(resolvedTargetDirectory, { recursive: true });
    } catch (error) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.TargetDirectoryAccessError,
        new ReferenceError(
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
   * @param targetDirectory - Optional base target directory provided by the caller.
   * @param trackInfo - Track metadata used to replace placeholders.
   * @returns The final target path for the rename operation.
   * @throws {RenamerGuardError} When target path preparation fails.
   */
  private resolveTargetPath(
    trackPath: string,
    targetDirectory: string | undefined,
    trackInfo: TrackInfo,
  ): string {
    const filename = this.buildTargetFilename(
      trackPath,
      trackInfo,
    );

    const resolvedTargetDirectory = this.resolveTargetDirectoryPath(
      trackPath,
      targetDirectory,
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
   * and optional target directory, executes the filesystem rename operation,
   * and returns a discriminated result describing either success or failure.
   *
   * @param trackPath - Path to the source track file.
   * @param trackInfo - Track metadata used to build the target path.
   * @param targetDirectory - Optional base target directory provided by the caller.
   * @returns A renamer result describing either the resolved target path or the
   * classified failure.
   */
  rename(
    trackPath: string,
    trackInfo: TrackInfo,
    targetDirectory?: string,
  ): BearTunesRenamerResult {
    let targetPath: string;

    try {
      targetPath = this.resolveTargetPath(
        trackPath,
        targetDirectory,
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
      logger.info(`File was renamed to: "${targetPath}"`);
    }

    return BearTunesRenamer.createSuccessResult(targetPath);
  }
}
