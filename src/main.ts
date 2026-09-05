/**
 * BearTunes CLI application entry point.
 *
 * Validates positional directory arguments, runs the audio processing pipeline,
 * and maps processing outcomes and unexpected application failures to logs and
 * process exit codes.
 */

import process from 'node:process';

import logger from '#logger';

import {
  BearTunesProcessor,
  DirectoryProcessingStatus,
} from '#processor';

import {
  normalizeUnknownError,
} from '#tools';

import {
  BearTunesExitCode,
} from './main.types.js';

import type {
  DirectoryArguments,
} from './main.types.js';

/**
 * Parses positional directory arguments accepted by the BearTunes CLI.
 *
 * The CLI accepts an optional input directory and an optional output directory.
 * When no input directory is provided, the current working directory is used.
 *
 * @param values - Positional command-line arguments without the Node.js executable and script path.
 * @returns Parsed directory arguments, or `undefined` when the argument count
 * or argument values are invalid.
 */
function parseDirectoryArguments(
  values: readonly string[],
): DirectoryArguments | undefined {
  if (
    values.length > 2
    || values.some((value) => value.trim().length === 0)
  ) {
    return undefined;
  }

  const [inputDirectory = '.', outputDirectory] = values;

  return {
    inputDirectory,
    outputDirectory,
  };
}

// Last-resort handlers for failures that reach the process level.
// - `unhandledRejection`: a Promise rejection with no attached error handler.
// - `uncaughtException`: an exception that escaped application-level handling.
//
// Each handler logs the failure and sets a non-zero exit code, allowing Node to
// finish pending I/O and exit naturally instead of forcing immediate shutdown.

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

const cliArguments = process.argv.slice(2);

const directoryArguments = parseDirectoryArguments(cliArguments);

if (directoryArguments === undefined) {
  logger.error('Invalid command-line arguments', {
    arguments: cliArguments,
    usage: 'npm run start -- [input-directory] [output-directory]',
  });

  process.exitCode = BearTunesExitCode.InvalidCommandLineArguments;
} else {
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
  const processor = new BearTunesProcessor({ verbose: true });

  processor.processAllFilesInDirectory(
    directoryArguments.inputDirectory,
    directoryArguments.outputDirectory,
  )
    .then((result) => {
      switch (result) {
        case DirectoryProcessingStatus.FilesProcessed:
          return;

        case DirectoryProcessingStatus.NoSupportedFilesFound:
          logger.warn(
            `There are no suitable files in directory tree: ${directoryArguments.inputDirectory}`,
          );
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
}
