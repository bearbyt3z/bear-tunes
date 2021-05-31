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

import 'process'; // to assign process.exitCode (if imported with "* as process" => TS2540: Cannot assign to 'exitCode' because it is a read-only property.)
import * as fs from 'fs';
import * as path from 'path';

import { BearTunesConverter, ConverterResult } from './converter';
import { BearTunesTagger } from './tagger';

const logger = require('./logger');

// const { createLogger, format, transports } = require('winston');
// const { combine, timestamp, label, printf } = format;

const tracksDirectory = process.argv[2] || '.';

const converter = new BearTunesConverter({}, true);
const tagger = new BearTunesTagger();

const processAllFilesInDirectory = async (directory) => {
  if (!fs.existsSync(tracksDirectory)) {
    // logger.silly(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.verbose(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.debug(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.info(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.warn(`Path specified doesn't exist: ${tracksDirectory}`);
    logger.error(`Path specified doesn't exist: ${tracksDirectory}`);
    process.exitCode = 1;
    return;
    // process.exit(1);
  }

  if (!fs.statSync(tracksDirectory).isDirectory()) {
    logger.error(`Path specified isn't a directory: ${tracksDirectory}`);
    process.exitCode = 2;
    return;
    // process.exit(2);
  }

  fs.readdir(directory, async (error, files) => {
    const directoryWithSeparator: string = directory.replace(/\/+$/, path.sep);
    let noFilesWereProcessed = true;
    if (error) {
      logger.error(`Couldn't read directory: ${tracksDirectory}`);
      process.exitCode = 3;
      return;
      // process.exit(3);
    }
    // if (files.length < 1) {
    //   console.error(`There are no files in a directory: ${tracksDirectory}`);
    //   process.exit(4);  // breaks process when no files in subdirectory!!!
    // }
    const flacFiles: Array<string> = [];

    for (const file of files) {
      const filePath = directoryWithSeparator + file;
      if (fs.statSync(filePath).isDirectory()) {
        processAllFilesInDirectory(filePath);
      } else if (path.extname(file) === '.mp3') {
        const flacIndex = flacFiles.indexOf(filePath);
        if (flacIndex > -1) {
          flacFiles.splice(flacIndex, 1);
        } else {
          noFilesWereProcessed = false;
          await tagger.processTrack(filePath);
        }
      } else if (path.extname(file) === '.flac') {
        noFilesWereProcessed = false;
        logger.silly('########################################');
        logger.info(`Converting flac to mp3: ${filePath}`);
        const result: ConverterResult = converter.flacToMp3(filePath);
        if (result.status === 0) {
          logger.info(`flac file: ${filePath}\nwas converted to mp3: ${result.outputPath}`);
          flacFiles.push(result.outputPath);
          await tagger.processTrack(result.outputPath);
        } else {
          logger.warn(
            `Converting file ${filePath} failed with code ${result.status} and message:\n${result.error?.message}:\nstderr: ${result.lameStderr}`,
          );
        }
      }
    }

    if (noFilesWereProcessed) {
      logger.error(`There are no suitable files in directory: ${directory}`);
      process.exitCode = 1;
    }
  });
};

processAllFilesInDirectory(tracksDirectory);
