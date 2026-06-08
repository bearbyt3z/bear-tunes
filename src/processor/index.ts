import * as fs from 'node:fs';
import * as path from 'node:path';

import { USER_AGENT_CACHE_FILE } from '#config';
import logger from '#logger';
import {
  AudioFileType,
  downloadAndSaveArtwork,
  isEmptyPlainObject,
  tryGetAudioFileTypeFromFile,
} from '#tools';

import { BearTunesConverter } from '#converter';
import { BearTunesRenamer } from '#renamer';
import { BearTunesTagger } from '#tagger';

import {
  DirectoryProcessingStatus,
} from './types.js';

import type { BearTunesConverterResult } from '#converter';

import type {
  BearTunesProcessorDependencies,
  BearTunesProcessorOptions,
  ReadDirectoryEntriesResult,
} from './types.js';

// reexporting enums & types, so they will be included in the processor import
export {
  DirectoryProcessingStatus,
};

export type {
  BearTunesProcessorDependencies,
  BearTunesProcessorOptions,
  ReadDirectoryEntriesResult,
};

// Default options are intentionally defined as immutable:
// - `as const` keeps exact literal types and readonly fields,
// - `satisfies` checks compatibility with the public options type,
// - `Object.freeze()` guards against accidental mutation at runtime.
const defaultProcessorOptions = Object.freeze({
  convertFlacToMp3: true,
  verbose: false,
} as const satisfies BearTunesProcessorOptions);

/**
 * Creates the default processor dependencies using a shared verbosity setting.
 *
 * This helper is used when callers do not provide custom converter, tagger, or
 * renamer instances and want the processor to construct its standard dependency set.
 *
 * @param verbose - The verbosity flag propagated to all default processor dependencies.
 * @returns The default converter, tagger, and renamer instances for the processor.
 */
const createDefaultProcessorDependencies = (
  verbose: boolean,
): BearTunesProcessorDependencies => {
  return {
    converter: new BearTunesConverter({ verbose }),
    tagger: new BearTunesTagger({ verbose }),
    renamer: new BearTunesRenamer({ verbose }),
  };
};

export class BearTunesProcessor {
  private readonly options: BearTunesProcessorOptions;

  private readonly dependencies: BearTunesProcessorDependencies;

  private readonly flacFiles: Set<string>;

  constructor(
    options: Partial<BearTunesProcessorOptions> = {},
    dependencies: Partial<BearTunesProcessorDependencies> = {},
  ) {
    this.options = {
      ...defaultProcessorOptions,
      ...options,
    };

    this.dependencies = {
      ...createDefaultProcessorDependencies(this.options.verbose),
      ...dependencies,
    };

    this.flacFiles = new Set<string>();
  }

  /**
   * Downloads and stores album artwork for a processed track when artwork metadata is available.
   *
   * The function logs whether artwork was written, unavailable, or failed to download,
   * but it does not throw conversion-stopping errors to the caller.
   *
   * @param filePath - The target audio file path used to derive the artwork output location.
   * @param artworkUrl - The direct artwork URL resolved from track metadata, when available.
   * @param albumUrl - The album page URL that can be used as a fallback artwork source.
   * @returns A promise that resolves when the artwork download attempt finishes.
   */
  private static async downloadArtworkForTrack(
    filePath: string,
    artworkUrl?: URL,
    albumUrl?: URL,
  ): Promise<void> {
    try {
      const artworkPath = await downloadAndSaveArtwork(
        filePath,
        artworkUrl,
        albumUrl,
        USER_AGENT_CACHE_FILE,
      );

      if (artworkPath) {
        logger.info(`Artwork written to: "${artworkPath}"`);
      } else {
        logger.info('No artwork to download.');
      }
    } catch (error) {
      logger.error('Artwork download failed', { error });
    }
  }

  /**
   * Logs a standardized warning message for a failed audio conversion.
   *
   * The helper keeps conversion-specific error formatting in one place so callers
   * do not need to duplicate warning message construction.
   *
   * @param filePath - The source file whose conversion failed.
   * @param result - The converter result containing status, error, and stderr details.
   * @param stderrLabel - The label used to describe the stderr output in the warning message.
   */
  private static logConversionFailure(
    filePath: string,
    result: BearTunesConverterResult,
    stderrLabel: string,
  ): void {
    let warnMessage = `Converting file ${filePath} failed with status code ${result.status} and message:\n`;
    warnMessage += `${result.error?.message}:\n${stderrLabel}: ${result.encoderStderr}`;
    logger.warn(warnMessage);
  }

  /**
   * Processes a standalone MP3 file by reading track metadata, renaming the file,
   * and downloading album artwork when possible.
   *
   * MP3 files that were just produced from a FLAC conversion are skipped here to avoid
   * processing the same logical track twice during a single run.
   *
   * @param filePath - The MP3 file to process.
   * @param outputDirectory - An optional destination directory for renamed output files.
   * @returns A promise resolving to `true` when the MP3 file was successfully processed,
   * or to `false` when the file was skipped or could not be processed.
   */
  private async processMp3File(filePath: string, outputDirectory?: string): Promise<boolean> {
    if (this.flacFiles.has(filePath)) {
      this.flacFiles.delete(filePath);
      return false;
    }

    const trackInfo = await this.dependencies.tagger.processTrack(filePath);

    if (isEmptyPlainObject(trackInfo)) {
      logger.warn(`No track info found for MP3 file: ${filePath}`);
      return false;
    }

    const filePathRenamed = this.dependencies.renamer.rename(filePath, trackInfo, outputDirectory);

    await BearTunesProcessor.downloadArtworkForTrack(
      filePathRenamed,
      trackInfo.album?.artwork,
      trackInfo.album?.url,
    );

    return true;
  }

  /**
   * Processes a FLAC file by optionally converting it to MP3 for metadata extraction,
   * then saving refreshed tags back to the original FLAC file, renaming outputs,
   * and downloading artwork.
   *
   * When `convertFlacToMp3` is enabled, the function converts the FLAC file to MP3,
   * extracts track metadata from the converted MP3, and tracks that generated MP3 path
   * so later directory traversal does not process it again as an unrelated input file.
   *
   * When `convertFlacToMp3` is disabled, the function extracts track metadata directly
   * from the FLAC file instead and skips MP3 conversion entirely.
   *
   * @param filePath - The FLAC file to process.
   * @param outputDirectory - An optional destination directory for renamed output files.
   * @returns A promise resolving to `true` when the FLAC file was successfully processed,
   * or to `false` when conversion, metadata extraction, or subsequent processing failed.
   */
  private async processFlacFile(filePath: string, outputDirectory?: string): Promise<boolean> {
    let trackInfoSourcePath = filePath;
    let convertedMp3Path: string | undefined;

    if (this.options.convertFlacToMp3) {
      logger.silly('########################################');
      logger.info(`Converting FLAC to MP3: ${filePath}`);

      const result = await this.dependencies.converter.flacToMp3(filePath);

      if (result.status !== 0 || !result.outputPath) {
        BearTunesProcessor.logConversionFailure(filePath, result, 'lame stderr');
        return false;
      }

      logger.info(`FLAC file was converted to MP3: ${result.outputPath}`);

      convertedMp3Path = result.outputPath;
      trackInfoSourcePath = result.outputPath;
      this.flacFiles.add(result.outputPath);
    }

    const trackInfo = await this.dependencies.tagger.processTrack(trackInfoSourcePath);

    if (isEmptyPlainObject(trackInfo)) {
      if (convertedMp3Path) {
        this.flacFiles.delete(convertedMp3Path);
        logger.warn(`No track info found for converted FLAC/MP3 pair: ${filePath}`);
      } else {
        logger.warn(`No track info found for FLAC file: ${filePath}`);
      }

      return false;
    }

    if (convertedMp3Path) {
      const mp3FilePathRenamed = this.dependencies.renamer.rename(
        convertedMp3Path,
        trackInfo,
        outputDirectory,
      );

      this.flacFiles.delete(convertedMp3Path);
      this.flacFiles.add(mp3FilePathRenamed);
    }

    await this.dependencies.tagger.saveId3TagToFlacFile(filePath, trackInfo);

    const filePathRenamed = this.dependencies.renamer.rename(
      filePath,
      trackInfo,
      outputDirectory,
    );

    await BearTunesProcessor.downloadArtworkForTrack(
      filePathRenamed,
      trackInfo.album?.artwork,
      trackInfo.album?.url,
    );

    return true;
  }

  /**
   * Converts an AIFF file to FLAC and then forwards the resulting FLAC file
   * to the standard FLAC processing pipeline.
   *
   * This keeps AIFF-specific handling limited to the initial conversion step while
   * reusing the existing FLAC-to-MP3, tagging, renaming, and artwork flow.
   *
   * @param filePath - The AIFF file to convert.
   * @param outputDirectory - An optional destination directory for renamed output files.
   * @returns A promise resolving to `true` when the AIFF file was successfully converted
   * and processed through the FLAC pipeline, or to `false` when conversion or subsequent
   * processing failed.
   */
  private async processAiffFile(filePath: string, outputDirectory?: string): Promise<boolean> {
    logger.silly('########################################');
    logger.info(`Converting AIFF to FLAC: ${filePath}`);

    const result = this.dependencies.converter.aiffToFlac(filePath, undefined, true);

    if (result.status !== 0 || !result.outputPath) {
      BearTunesProcessor.logConversionFailure(filePath, result, 'flac stderr');
      return false;
    }

    logger.info(`AIFF file was converted to FLAC: ${result.outputPath}`);

    return await this.processFlacFile(result.outputPath, outputDirectory);
  }

  /**
   * Dispatches a file to the appropriate processing pipeline based on its detected audio type.
   *
   * The audio type is resolved by the shared audio tools layer. Supported formats
   * are MP3, FLAC, AIF, and AIFF. Files whose audio type cannot be detected are ignored.
   *
   * @param filePath - The file path to inspect and process.
   * @param outputDirectory - An optional destination directory for renamed output files.
   * @returns A promise resolving to `true` when a supported file was successfully processed,
   * or to `false` when the file type is unsupported, cannot be detected, or processing did not succeed.
   */
  private async processSupportedFile(
    filePath: string,
    outputDirectory?: string,
  ): Promise<boolean> {
    const audioFileType = await tryGetAudioFileTypeFromFile(filePath);

    switch (audioFileType) {
      case AudioFileType.Mp3:
        return await this.processMp3File(filePath, outputDirectory);

      case AudioFileType.Aiff:
        return await this.processAiffFile(filePath, outputDirectory);

      case AudioFileType.Flac:
        return await this.processFlacFile(filePath, outputDirectory);

      case undefined:
        return false;
    }
  }

  /**
   * Validates that a path resolves to a readable directory and then returns its entries.
   *
   * The function first inspects the path metadata to distinguish between a missing path,
   * a non-directory path, and other filesystem access failures. It then attempts to read
   * the directory entries.
   *
   * When validation or reading fails, the function logs the reason and returns a
   * `DirectoryProcessingStatus` value describing the failure, so callers can propagate
   * the outcome without relying on side effects such as `process.exitCode`.
   *
   * @param directoryPath - The directory path to validate and read.
   * @returns A promise resolving to directory entries when the path points to a readable
   * directory, or to a `DirectoryProcessingStatus` error value when validation or reading fails.
   */
  private static async readDirectoryEntries(
    directoryPath: string,
  ): Promise<ReadDirectoryEntriesResult> {
    let stats: fs.Stats;

    try {
      stats = await fs.promises.stat(directoryPath);
    } catch (error: unknown) {
      const errnoError = error as NodeJS.ErrnoException;

      if (errnoError.code === 'ENOENT') {
        logger.error(`Path specified doesn't exist: ${directoryPath}`);
        return DirectoryProcessingStatus.PathDoesNotExist;
      }

      logger.error(`Couldn't stat path: ${directoryPath}`, { error });
      return DirectoryProcessingStatus.CannotReadDirectory;
    }

    if (!stats.isDirectory()) {
      logger.error(`Path specified isn't a directory: ${directoryPath}`);
      return DirectoryProcessingStatus.PathIsNotDirectory;
    }

    try {
      return await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch (error: unknown) {
      logger.error(`Couldn't read directory: ${directoryPath}`, { error });
      return DirectoryProcessingStatus.CannotReadDirectory;
    }
  }

  /**
   * Checks whether a path is still accessible before processing it.
   *
   * This protects directory traversal against race conditions where an entry returned
   * by `readdir()` disappears or becomes inaccessible before it is handled.
   *
   * @param filePath - The path to verify.
   * @returns A promise resolving to `true` when the path is accessible, otherwise `false`.
   */
  private static async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      logger.warn(`Path does not exist or is not accessible: ${filePath}`);
      return false;
    }
  }

  /**
   * Recursively traverses an input directory and processes every supported audio file it finds.
   *
   * The function descends into subdirectories, dispatches supported files to their
   * format-specific handlers, and aggregates the final processing result for the
   * entire current directory subtree.
   *
   * If any nested directory fails validation or cannot be read, that status is
   * returned immediately and propagated to the top-level caller. Otherwise, the
   * function reports whether at least one supported file was processed anywhere
   * in the subtree.
   *
   * @param inputDirectory - The directory to scan recursively.
   * @param outputDirectory - An optional destination directory for renamed output files.
   * @returns A promise resolving to a `DirectoryProcessingStatus` that describes
   * the outcome for the entire current directory subtree.
   */
  public async processAllFilesInDirectory(
    inputDirectory: string,
    outputDirectory?: string,
  ): Promise<DirectoryProcessingStatus> {
    let anyFilesWereProcessed = false;

    const entries = await BearTunesProcessor.readDirectoryEntries(inputDirectory);
    if (!Array.isArray(entries)) {
      return entries;
    }

    for (const entry of entries) {
      const filePath = path.join(inputDirectory, entry.name);

      if (!(await BearTunesProcessor.pathExists(filePath))) {
        continue;
      }

      if (entry.isDirectory()) {
        const subtreeResult = await this.processAllFilesInDirectory(filePath, outputDirectory);

        switch (subtreeResult) {
          case DirectoryProcessingStatus.FilesProcessed:
            anyFilesWereProcessed = true;
            break;

          case DirectoryProcessingStatus.NoSupportedFilesFound:
            break;

          case DirectoryProcessingStatus.PathDoesNotExist:
          case DirectoryProcessingStatus.PathIsNotDirectory:
          case DirectoryProcessingStatus.CannotReadDirectory:
            return subtreeResult;
        }
      } else {
        const wasProcessed = await this.processSupportedFile(filePath, outputDirectory);

        if (wasProcessed) {
          anyFilesWereProcessed = true;
        }
      }
    }

    return anyFilesWereProcessed
      ? DirectoryProcessingStatus.FilesProcessed
      : DirectoryProcessingStatus.NoSupportedFilesFound;
  }
}
