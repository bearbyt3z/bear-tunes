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
   * @param outputPath - Resolved path of the renamed file.
   * @returns A renamer success result with `ok` set to `true`.
   */
  private static createSuccessResult(outputPath: string): BearTunesRenamerSuccessResult {
    return { ok: true, outputPath };
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

  private static bindValues(pattern: string, trackInfo: TrackInfo): string {
    const result = pattern.replace(/%\w+%/ig, (match) => {
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
            `${this.name}: Property ${keyName} wasn't defined in ${typeof trackInfo} parameter`,
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

    return result;
  }

  /**
   * Resolves the output directory path to use for a rename operation.
   *
   * When `outputDirectory` is not provided, the method returns the current
   * directory of the source track. Otherwise it validates the provided output
   * directory, binds the configured directory pattern to track metadata,
   * sanitizes the path, creates missing directories, and returns the resolved
   * output directory path.
   *
   * @param trackPath - Path to the source track file.
   * @param outputDirectory - Optional base output directory provided by the caller.
   * @param trackInfo - Track metadata used to bind directory placeholders.
   * @returns The resolved output directory path.
   * @throws {RenamerGuardError} When the output directory is invalid,
   * inaccessible, or cannot be created.
   */
  private resolveOutputDirectoryPath(
    trackPath: string,
    outputDirectory: string | undefined,
    trackInfo: TrackInfo,
  ): string {
    if (outputDirectory === undefined) {
      return path.dirname(trackPath);
    }

    let outputDirectoryStats: fs.Stats;

    try {
      outputDirectoryStats = fs.lstatSync(outputDirectory);
    } catch (error) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.OutputDirectoryAccessError,
        new ReferenceError(
          `${this.constructor.name}: Cannot access output directory path ${outputDirectory}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    if (!outputDirectoryStats.isDirectory()) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.InvalidOutputDirectory,
        new TypeError(
          `${this.constructor.name}: Specified output directory path ${outputDirectory} is not a directory`,
        ),
      );
    }

    const normalizedOutputDirectory = outputDirectory.replace(/[/\\]+$/, path.sep);
    const boundDirectory = BearTunesRenamer.bindValues(this.options.directoryPattern, trackInfo);

    const boundDirectorySegments = boundDirectory
      .split(/[/\\]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => replacePathForbiddenChars(segment));

    const resolvedOutputDirectory = boundDirectorySegments.length > 0
      ? path.join(normalizedOutputDirectory, ...boundDirectorySegments)
      : normalizedOutputDirectory;

    try {
      fs.mkdirSync(resolvedOutputDirectory, { recursive: true });
    } catch (error) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.OutputDirectoryAccessError,
        new ReferenceError(
          `${this.constructor.name}: Cannot create output directory ${resolvedOutputDirectory}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    return resolvedOutputDirectory;
  }

  /**
   * Builds the target file name for a rename operation.
   *
   * The method binds the configured filename pattern to track metadata,
   * preserves the original file extension, and sanitizes the resulting
   * file name so it can be safely used in the filesystem.
   *
   * @param trackPath - Path to the source track file.
   * @param trackInfo - Track metadata used to bind filename placeholders.
   * @returns The sanitized target file name including the original extension.
   * @throws {RenamerGuardError} When binding the filename pattern fails.
   */
  private buildOutputFilename(
    trackPath: string,
    trackInfo: TrackInfo,
  ): string {
    return replacePathForbiddenChars(
      BearTunesRenamer.bindValues(this.options.filenamePattern, trackInfo)
      + path.extname(trackPath),
    );
  }

  /**
   * Resolves the final output file path for a rename operation.
   *
   * The method builds the target file name, resolves the output directory,
   * and combines both parts into the final destination path.
   *
   * @param trackPath - Path to the source track file.
   * @param outputDirectory - Optional base output directory provided by the caller.
   * @param trackInfo - Track metadata used to bind placeholders.
   * @returns The final output path for the rename operation.
   * @throws {RenamerGuardError} When output path preparation fails.
   */
  private resolveOutputPath(
    trackPath: string,
    outputDirectory: string | undefined,
    trackInfo: TrackInfo,
  ): string {
    const filename = this.buildOutputFilename(
      trackPath,
      trackInfo,
    );

    const resolvedOutputDirectory = this.resolveOutputDirectoryPath(
      trackPath,
      outputDirectory,
      trackInfo,
    );

    return path.join(resolvedOutputDirectory, filename);
  }

  /**
   * Executes the filesystem rename step for a prepared output path.
   *
   * @param trackPath - Path to the source track file.
   * @param outputPath - Final destination path for the renamed file.
   * @throws {RenamerGuardError} When the filesystem rename operation fails.
   */
  private executeRenameOperation(
    trackPath: string,
    outputPath: string,
  ): void {
    try {
      fs.renameSync(trackPath, outputPath);
    } catch (error) {
      throw new RenamerGuardError(
        BearTunesRenamerFailureCode.RenameOperationFailed,
        new Error(
          `${this.constructor.name}: Failed to rename ${trackPath} to ${outputPath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }
  }

  rename(
    trackPath: string,
    trackInfo: TrackInfo,
    outputDirectory?: string,
  ): BearTunesRenamerResult {
    let outputPath: string;

    try {
      outputPath = this.resolveOutputPath(
        trackPath,
        outputDirectory,
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
      this.executeRenameOperation(trackPath, outputPath);
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
      logger.info(`File was renamed to: "${outputPath}"`);
    }

    return BearTunesRenamer.createSuccessResult(outputPath);
  }
}
