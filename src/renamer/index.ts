import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '#logger';
import {
  replacePathForbiddenChars,
} from '#tools';

import type { BearTunesRenamerOptions } from './types.js';
import type { TrackInfo } from '#shared-types';

// reexporting type, so it will be included in the renamer module import
export type { BearTunesRenamerOptions };

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
      } else if (fs.lstatSync(outputDirectory).isDirectory()) {
        const normalizedOutputDirectory = outputDirectory.replace(/[/\\]+$/, path.sep);
        const boundDirectory = BearTunesRenamer.bindValues(
          this.options.directoryPattern,
          trackInfo,
        );

        outputPath = normalizedOutputDirectory + replacePathForbiddenChars(boundDirectory);

        fs.mkdirSync(outputPath, { recursive: true });
      } else {
        throw new TypeError(`${this.constructor.name}: Specified output directory path ${outputDirectory} is not a valid directory`);
      }
    } catch (error) {
      throw new ReferenceError(`${this.constructor.name}: Cannot access directory ${outputDirectory} (incorrect path?)`, { cause: error });
    }

    outputPath += path.sep + replacePathForbiddenChars(filename);

    fs.renameSync(trackPath, outputPath);

    if (this.options.verbose) {
      logger.info(`File was renamed to: "${outputPath}"`);
    }

    return outputPath;
  }

  static bindValues(pattern: string, trackInfo: TrackInfo): string {
    const result = pattern.replace(/%\w+%/ig, (match) => {
      const keyName = match.replace(/%/g, '');

      if (!keyName || !(keyName in trackInfo)) {
        throw new TypeError(`${this.constructor.name}: Rename pattern contains illegal property name: ${keyName}`);
      }

      const key = keyName as keyof TrackInfo;
      const value = trackInfo[key];

      if (value === undefined) {
        throw new ReferenceError(`${this.constructor.name}: Property ${keyName} wasn't defined in ${typeof trackInfo} parameter`);
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

    return result.replace(/[/\\]+/, path.sep); // changing for the right path separator
  }
}
