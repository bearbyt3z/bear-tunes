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

// const { createLogger, format, transports } = require('winston');
// const { combine, timestamp, label, printf } = format;

const inputDirectory = process.argv[2] ?? '.';
const outputDirectory = process.argv[3] ?? undefined;

const processor = new BearTunesProcessor({ verbose: true });

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
        process.exitCode = 1;
        return;

      case DirectoryProcessingStatus.PathDoesNotExist:
        process.exitCode = 2;
        return;

      case DirectoryProcessingStatus.PathIsNotDirectory:
        process.exitCode = 3;
        return;

      case DirectoryProcessingStatus.CannotReadDirectory:
        process.exitCode = 4;
        return;
    }
  })
  .catch((error: unknown) => {
    logger.error(error);
    process.exitCode = 1;
  });
