// https://github.com/aadsm/JavaScript-ID3-Reader
// ID3 tags reader in JavaScript (ID3v1, ID3v2 and AAC) http://www.aadsm.net/libraries/id3/

// https://antimatter15.com/wp/2010/07/a-bright-coloured-fish-parsing-id3v2-tags-in-javascript-and-extensionfm/
// https://github.com/antimatter15/js-id3v2

// https://wiki.hydrogenaud.io/index.php?title=Tag_Mapping
// http://id3.org/id3v2.4.0-frames
// https://eyed3.readthedocs.io/en/latest/plugins/classic_plugin.html
// https://eyed3.readthedocs.io/en/latest/_modules/eyed3/id3/frames.html
// https://readthedocs.org/projects/eyed3/downloads/pdf/latest/

// display plugin of eyeD3 requires grako:
// $pip install grako

import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

import { USER_AGENT_CACHE_FILE } from '#config';
import logger from '#logger';
import {
  downloadAndSaveArtwork,
  isEmptyPlainObject,
} from '#tools';

import { BearTunesConverter } from '#converter';
import { BearTunesRenamer } from '#renamer';
import { BearTunesTagger } from '#tagger';

import type { BearTunesConverterResult } from '#converter';

// const { createLogger, format, transports } = require('winston');
// const { combine, timestamp, label, printf } = format;

const inputDirectory = process.argv[2] ?? '.';
const outputDirectory = process.argv[3] ?? undefined;

const converter = new BearTunesConverter({ verbose: true });
const tagger = new BearTunesTagger({ verbose: false });
const renamer = new BearTunesRenamer({ verbose: true });

const flacFiles = new Set<string>();

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
const downloadArtworkForTrack = async (
  filePath: string,
  artworkUrl?: URL,
  albumUrl?: URL,
): Promise<void> => {
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
};

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
const logConversionFailure = (
  filePath: string,
  result: BearTunesConverterResult,
  stderrLabel: string,
): void => {
  let warnMessage = `Converting file ${filePath} failed with status code ${result.status} and message:\n`;
  warnMessage += `${result.error?.message}:\n${stderrLabel}: ${result.lameStderr}`;
  logger.warn(warnMessage);
};

/**
 * Processes a standalone MP3 file by reading track metadata, renaming the file,
 * and downloading album artwork when possible.
 *
 * MP3 files that were just produced from a FLAC conversion are skipped here to avoid
 * processing the same logical track twice during a single run.
 *
 * @param filePath - The MP3 file to process.
 * @param outputDirectory - An optional destination directory for renamed output files.
 * @returns A promise that resolves when MP3 processing is complete.
 */
const processMp3File = async (filePath: string, outputDirectory?: string): Promise<void> => {
  if (flacFiles.has(filePath)) {
    flacFiles.delete(filePath);
    return;
  }

  const trackInfo = await tagger.processTrack(filePath);

  if (!isEmptyPlainObject(trackInfo)) {
    const filePathRenamed = renamer.rename(filePath, trackInfo, outputDirectory);

    await downloadArtworkForTrack(
      filePathRenamed,
      trackInfo.album?.artwork,
      trackInfo.album?.url,
    );
  } else {
    logger.warn(`No track info found for MP3 file: ${filePath}`);
  }
};

/**
 * Converts a FLAC file to MP3, extracts track metadata from the converted MP3,
 * propagates tags back to the FLAC file, renames both outputs, and downloads artwork.
 *
 * The function also tracks the generated MP3 path so that the later directory traversal
 * does not process that MP3 again as if it were an unrelated input file.
 *
 * @param filePath - The FLAC file to convert and post-process.
 * @param outputDirectory - An optional destination directory for renamed output files.
 * @returns A promise that resolves when FLAC processing is complete.
 */
const processFlacFile = async (filePath: string, outputDirectory?: string): Promise<void> => {
  logger.silly('########################################');
  logger.info(`Converting flac to mp3: ${filePath}`);

  const result = converter.flacToMp3(filePath);

  if (result.status === 0 && result.outputPath) {
    logger.info(`flac file: ${filePath}\nwas converted to mp3: ${result.outputPath}`);
    flacFiles.add(result.outputPath);

    const trackInfo = await tagger.processTrack(result.outputPath);

    if (!isEmptyPlainObject(trackInfo)) {
      const mp3FilePathRenamed = renamer.rename(result.outputPath, trackInfo, outputDirectory);

      flacFiles.delete(result.outputPath);
      flacFiles.add(mp3FilePathRenamed);

      await tagger.saveId3TagToFlacFile(filePath, trackInfo);

      const filePathRenamed = renamer.rename(filePath, trackInfo, outputDirectory);

      await downloadArtworkForTrack(
        filePathRenamed,
        trackInfo.album?.artwork,
        trackInfo.album?.url,
      );
    } else {
      logger.warn(`No track info found for converted FLAC/MP3 pair: ${filePath}`);
    }
  } else {
    logConversionFailure(filePath, result, 'Lame stderr');
  }
};

/**
 * Converts an AIFF file to FLAC and then forwards the resulting FLAC file
 * to the standard FLAC processing pipeline.
 *
 * This keeps AIFF-specific handling limited to the initial conversion step while
 * reusing the existing FLAC-to-MP3, tagging, renaming, and artwork flow.
 *
 * @param filePath - The AIFF file to convert.
 * @param outputDirectory - An optional destination directory for renamed output files.
 * @returns A promise that resolves when AIFF processing is complete.
 */
const processAiffFile = async (filePath: string, outputDirectory?: string): Promise<void> => {
  logger.silly('########################################');
  logger.info(`Converting aiff to flac: ${filePath}`);

  const result = converter.aiffToFlac(filePath, undefined, true);

  if (result.status === 0 && result.outputPath) {
    logger.info(`aiff file: ${filePath}\nwas converted to flac: ${result.outputPath}`);
    await processFlacFile(result.outputPath, outputDirectory);
  } else {
    logConversionFailure(filePath, result, 'flac stderr');
  }
};

/**
 * Dispatches a file to the appropriate processing pipeline based on its extension.
 *
 * Supported formats are MP3, FLAC, AIF, and AIFF. Unsupported files are ignored.
 *
 * @param filePath - The file path to inspect and process.
 * @param outputDirectory - An optional destination directory for renamed output files.
 * @returns A promise resolving to `true` when the file type is supported, otherwise `false`.
 */
const processSupportedFile = async (
  filePath: string,
  outputDirectory?: string,
): Promise<boolean> => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.mp3') {
    await processMp3File(filePath, outputDirectory);
    return true;
  }

  if (extension === '.aif' || extension === '.aiff') {
    await processAiffFile(filePath, outputDirectory);
    return true;
  }

  if (extension === '.flac') {
    await processFlacFile(filePath, outputDirectory);
    return true;
  }

  return false;
};

/**
 * Validates that a path exists and points to a readable directory, then returns its entries.
 *
 * When validation fails, the function logs the reason, updates `process.exitCode`,
 * and returns `undefined` so the caller can stop processing that branch safely.
 *
 * @param directoryPath - The directory path to validate and read.
 * @returns A promise resolving to directory entries, or `undefined` when the directory cannot be read.
 */
const readDirectoryEntries = async (
  directoryPath: string,
): Promise<fs.Dirent[] | undefined> => {
  if (!fs.existsSync(directoryPath)) {
    logger.error(`Path specified doesn't exist: ${directoryPath}`);
    process.exitCode = 1;
    return;
  }

  if (!fs.statSync(directoryPath).isDirectory()) {
    logger.error(`Path specified isn't a directory: ${directoryPath}`);
    process.exitCode = 2;
    return;
  }

  try {
    return await fs.promises.readdir(directoryPath, { withFileTypes: true });
  } catch {
    logger.error(`Couldn't read directory: ${directoryPath}`);
    process.exitCode = 3;
    return;
  }
};

/**
 * Checks whether a path is still accessible before processing it.
 *
 * This protects directory traversal against race conditions where an entry returned
 * by `readdir()` disappears or becomes inaccessible before it is handled.
 *
 * @param filePath - The path to verify.
 * @returns A promise resolving to `true` when the path is accessible, otherwise `false`.
 */
const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    logger.error(`Path does not exist or is not accessible: ${filePath}`);
    return false;
  }
};

/**
 * Recursively traverses an input directory and processes every supported audio file it finds.
 *
 * The function descends into subdirectories, dispatches supported files to their
 * format-specific handlers, and reports when a directory contains no processable files.
 *
 * @param inputDirectory - The directory to scan recursively.
 * @param outputDirectory - An optional destination directory for renamed output files.
 * @returns A promise that resolves when traversal and processing finish for the entire subtree.
 */
const processAllFilesInDirectory = async (inputDirectory: string, outputDirectory?: string): Promise<void> => {
  let noFilesWereProcessed = true;

  const entries = await readDirectoryEntries(inputDirectory);
  if (!entries) {
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(inputDirectory, entry.name);

    if (!(await pathExists(filePath))) {
      continue;
    }

    if (entry.isDirectory()) {
      await processAllFilesInDirectory(filePath, outputDirectory);
    } else {
      const wasProcessed = await processSupportedFile(filePath, outputDirectory);

      if (wasProcessed) {
        noFilesWereProcessed = false;
      }
    }
  }

  if (noFilesWereProcessed) {
    logger.warn(`There are no suitable files in directory: ${inputDirectory}`);
    process.exitCode = 1;
  }
};

// Last-resort handlers for errors that escape normal try/catch.
// - `unhandledRejection`: a rejected Promise with no handler.
// - `uncaughtException`: a synchronous throw not caught anywhere.
// We log the error and set a non-zero exit code, letting Node exit naturally
// (instead of forcing an immediate shutdown).

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exitCode = 1;
});

// Start the main async workflow (process all files) and attach a single, top-level
// error handler for anything that bubbles up as a rejected Promise.
//
// If an error reaches this point, it means we couldn't (or chose not to) recover
// locally, so we log it and signal failure to the calling environment (CI, shell).
// We set `process.exitCode` instead of calling `process.exit(1)` to let Node finish
// any pending I/O (e.g., flushing stderr) and exit naturally.
processAllFilesInDirectory(inputDirectory, outputDirectory)
  .catch((error: unknown) => {
    logger.error(error);
    process.exitCode = 1;
  });
