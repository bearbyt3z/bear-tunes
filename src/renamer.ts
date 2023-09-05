import * as fs from 'fs';
import * as path from 'path';

import { TrackInfo } from './types';
import { BearTunesRenamerOptions } from './renamer.types';

// exporting types, so they will be included in the renamer module import
export { BearTunesRenamerOptions };

const logger = require('./logger');
const tools = require('./tools');

const defaultRenamerOptions: BearTunesRenamerOptions = {
  filenamePattern: '%artists% - %title%', // title already contains remixers etc.
  directoryPattern: '%genre%/%artists%',
  verbose: true,
} as const;

export class BearTunesRenamer {
  options: BearTunesRenamerOptions;

  constructor(options: Partial<BearTunesRenamerOptions> = {}) {
    this.options = defaultRenamerOptions;
    Object.assign(this.options, options);
  }

  rename(trackPath: string, trackInfo: TrackInfo, outputDirectory?: string): string {
    // let newFilename = this.options.filenamePattern.replace(/%\w+%/ig, (match) => {
    //   const keyName = match.replace(/%/g, '');
    //   const key: keyof TrackInfo = keyName as keyof TrackInfo;
    //   if (!key) throw new TypeError(`${this.constructor.name}: Rename pattern contains illegal property name: ${keyName}`);
    //   if (trackInfo[key] === undefined) throw new ReferenceError(`${this.constructor.name}: Property ${keyName} wasn't defined in ${typeof trackInfo} parameter`);
    //   if (trackInfo[key] instanceof Array) return (trackInfo[key] as string[]).join(', ');
    //   return trackInfo[key]?.toString() ?? '';
    // });

    const filename = BearTunesRenamer.bindValues(this.options.filenamePattern, trackInfo) + path.extname(trackPath);
    let outputPath;

    try {
      if (!outputDirectory) {
        outputPath = path.dirname(trackPath);
      } else if (outputDirectory && fs.lstatSync(outputDirectory).isDirectory()) {
        outputPath = outputDirectory.replace(/[/\\]+$/, path.sep) + tools.replacePathForbiddenChars(BearTunesRenamer.bindValues(this.options.directoryPattern, trackInfo));
        fs.mkdirSync(outputPath, { recursive: true });
      } else {
        throw new TypeError(`${this.constructor.name}: Specified output directory path ${outputDirectory} is not a valid directory`);
      }
    } catch (error) {
      throw new ReferenceError(`${this.constructor.name}: Cannot access directory ${outputDirectory} (incorrect path?)`);
    }

    outputPath += path.sep + tools.replacePathForbiddenChars(filename);

    fs.renameSync(trackPath, outputPath);

    if (this.options.verbose) {
      logger.info(`File was renamed to: ${outputPath}`);
    }

    return outputPath;
  }

  static bindValues(pattern: string, trackInfo: TrackInfo): string {
    const result = pattern.replace(/%\w+%/ig, (match) => {
      const keyName = match.replace(/%/g, '');
      const key: keyof TrackInfo = keyName as keyof TrackInfo;
      if (!key) throw new TypeError(`${this.constructor.name}: Rename pattern contains illegal property name: ${keyName}`);
      if (trackInfo[key] === undefined) throw new ReferenceError(`${this.constructor.name}: Property ${keyName} wasn't defined in ${typeof trackInfo} parameter`);
      if (trackInfo[key] instanceof Array) return (trackInfo[key] as string[]).join(', ');
      return trackInfo[key]?.toString() ?? '';
    });

    return result.replace(/[/\\]+/, path.sep); // changing for the right path separator
  }
}
