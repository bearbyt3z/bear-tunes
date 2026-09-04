/**
 * BearTunes CLI application entry point.
 *
 * Reads the input directory and optional output directory from command-line
 * arguments, runs the audio processing pipeline, and maps directory processing
 * outcomes to application logs and process exit codes.
 */

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

import process from 'node:process';

import logger from '#logger';

import {
  BearTunesProcessor,
  DirectoryProcessingStatus,
} from '#processor';

import {
  normalizeUnknownError,
} from '#tools';

/**
 * Process exit codes returned by the BearTunes CLI.
 *
 * Codes are grouped by failure category so shell scripts can distinguish
 * expected processing outcomes, input-directory problems, and unexpected
 * application failures.
 */
enum BearTunesExitCode {
  /** Processing completed successfully. */
  Success = 0,

  // 10-19: command-line argument validation

  /** Command-line arguments do not match the supported CLI contract. */
  InvalidCommandLineArguments = 10,

  // 20-29: expected processing outcomes

  /** No supported audio files were found in the input directory tree. */
  NoSupportedFilesFound = 20,

  // 30-39: input directory failures

  /** The requested input directory path does not exist. */
  InputDirectoryDoesNotExist = 30,

  /** The requested input path exists but is not a directory. */
  InputPathIsNotDirectory = 31,

  /** The requested input directory cannot be read. */
  InputDirectoryCannotBeRead = 32,

  // 40-49: unexpected application failures

  /** The processing workflow rejected with an unexpected error. */
  UnexpectedProcessorFailure = 40,

  /** An unhandled promise rejection reached the process-level handler. */
  UnhandledPromiseRejection = 41,

  /** An uncaught exception reached the process-level handler. */
  UncaughtException = 42,
}

const inputDirectory = process.argv[2] ?? '.';
const outputDirectory = process.argv[3] ?? undefined;

const processor = new BearTunesProcessor({ verbose: true });

// Last-resort handlers for errors that escape normal try/catch.
// - `unhandledRejection`: a rejected Promise with no handler.
// - `uncaughtException`: a synchronous throw not caught anywhere.
// We log the error and set a non-zero exit code, letting Node exit naturally
// (instead of forcing an immediate shutdown).

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: normalizeUnknownError(reason),
  });

  process.exitCode = BearTunesExitCode.UnhandledPromiseRejection;
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error,
  });

  process.exitCode = BearTunesExitCode.UncaughtException;
});

// Start the main async workflow and handle the aggregated processing status for
// the entire input directory tree.
//
// The `then()` branch handles the normal completion path by mapping the returned
// `DirectoryProcessingStatus` to logging and process exit codes. The `catch()`
// branch remains the top-level fallback for unexpected errors that escape the
// explicit status-based flow.
//
// We set `process.exitCode` instead of calling `process.exit(1)` to let Node finish
// any pending I/O (e.g., flushing stderr) and exit naturally.
processor.processAllFilesInDirectory(inputDirectory, outputDirectory)
  .then((result) => {
    switch (result) {
      case DirectoryProcessingStatus.FilesProcessed:
        return;

      case DirectoryProcessingStatus.NoSupportedFilesFound:
        logger.warn(`There are no suitable files in directory tree: ${inputDirectory}`);
        process.exitCode = BearTunesExitCode.NoSupportedFilesFound;
        return;

      case DirectoryProcessingStatus.PathDoesNotExist:
        process.exitCode = BearTunesExitCode.InputDirectoryDoesNotExist;
        return;

      case DirectoryProcessingStatus.PathIsNotDirectory:
        process.exitCode = BearTunesExitCode.InputPathIsNotDirectory;
        return;

      case DirectoryProcessingStatus.CannotReadDirectory:
        process.exitCode = BearTunesExitCode.InputDirectoryCannotBeRead;
        return;
    }
  })
  .catch((error: unknown) => {
    logger.error('Unexpected processor failure', {
      error: normalizeUnknownError(error),
    });

    process.exitCode = BearTunesExitCode.UnexpectedProcessorFailure;
  });
