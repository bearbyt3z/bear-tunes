import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '#logger';
import {
  BearTunesTagger,
  FlacImageBlockType,
} from '#tagger';
import {
  formatLocalDateToIsoDateString,
} from '#tools';

import {
  BitrateMethod,
  Quality,
  ChannelMode,
  ReplayGain,
} from './types.js';

import type {
  FlacImageBlockExport,
} from '#tagger';

import type {
  BearTunesConverterOptions,
  BearTunesConverterResult,
} from './types.js';

// reexporting enums & types, so they will be included in the converter import
export {
  BitrateMethod,
  Quality,
  ChannelMode,
  ReplayGain,
};

export type {
  BearTunesConverterOptions,
  BearTunesConverterResult,
};

// Default options are intentionally defined as immutable:
// - `as const` keeps exact literal types and readonly fields,
// - `satisfies` checks compatibility with the public options type,
// - `Object.freeze()` guards against accidental mutation at runtime.
const defaultConverterOptions = Object.freeze({
  bitrateMethod: BitrateMethod.CBR,
  bitrateValue: 320,
  bitrateValueMinimum: 256,
  bitrateValueMaximum: 320,
  quality: Quality.Q1,
  channelMode: ChannelMode.JointStereo,
  replayGain: ReplayGain.Accurate,
  transferTagEntries: false,
  verbose: false,
} as const satisfies BearTunesConverterOptions);

export class BearTunesConverter {
  options: BearTunesConverterOptions;

  constructor(options: Partial<BearTunesConverterOptions> = {}) {
    this.options = {
      ...defaultConverterOptions,
      ...options,
    };
  }

  aiffToFlac(
    aiffFilePath: string,
    outputPath: string | undefined = undefined,
    deleteAiffAfterConvertion = false,
  ): BearTunesConverterResult {
    const result: BearTunesConverterResult = {
      status: 0,
      error: undefined,
      lameStdout: undefined,
      lameStderr: undefined,
      outputPath: undefined,
    };

    try {
      if (!fs.lstatSync(aiffFilePath).isFile() || !aiffFilePath.match(/\.(aif|aiff)$/i)) {
        result.status = 101;
        result.error = new TypeError(
          `${this.constructor.name}: Specified path ${aiffFilePath} is not a file or does not have *.aif or *.aiff extension`,
        );
      }
    } catch (error) {
      result.status = 102;
      result.error = new ReferenceError(
        `${this.constructor.name}: Cannot access file ${aiffFilePath} (incorrect path?)`,
        { cause: error },
      );
    }

    let outputPathComputed: string | undefined;

    try {
      if (outputPath === undefined) {
        outputPathComputed = aiffFilePath.replace(/\.(aif|aiff)$/i, '.flac');
      } else if (fs.lstatSync(outputPath).isDirectory()) {
        outputPathComputed = outputPath.replace(/\/+$/, path.sep)
          + path.basename(aiffFilePath).replace(/\.(aif|aiff)$/i, '.flac');
      } else if (fs.lstatSync(outputPath).isFile()) {
        if (outputPath.match(/\.flac$/i)) {
          outputPathComputed = outputPath;
        } else {
          result.status = 103;
          result.error = new TypeError(
            `${this.constructor.name}: Specified output path ${outputPath} is a file but does not have *.flac extension`,
          );
        }
      } else {
        result.status = 104;
        result.error = new TypeError(
          `${this.constructor.name}: Specified output path ${outputPath} is neither a file nor directory`,
        );
      }
    } catch (error) {
      result.status = 105;
      result.error = new ReferenceError(
        `${this.constructor.name}: Cannot access file ${outputPath} (incorrect path?)`,
        { cause: error },
      );
    }

    if (result.status !== 0 || outputPathComputed === undefined) {
      return result;
    }

    result.outputPath = outputPathComputed;

    const childResult = childProcess.spawnSync(
      'flac',
      ['--verify', '-8', '--force', '--output-name', outputPathComputed, aiffFilePath],
      { stdio: 'inherit' },
    );

    if (childResult.status === null) {
      result.status = 106;
      result.error = new Error(`Convertion failed due to a signal: ${childResult.signal ?? 'signal is null'}`);
      return result;
    }

    if (childResult.status === 0 && deleteAiffAfterConvertion) {
      fs.unlinkSync(aiffFilePath);
    }

    result.status = childResult.status;
    result.error = childResult.error;
    result.lameStdout = childResult.stdout?.toString();
    result.lameStderr = childResult.stderr?.toString();

    return result;
  }

  flacToMp3(flacFilePath: string, outputPath: string | undefined = undefined, deleteFlacAfterConvertion = false): BearTunesConverterResult {
    const result: BearTunesConverterResult = {
      status: 0,
      error: undefined,
      lameStdout: undefined,
      lameStderr: undefined,
      outputPath: undefined,
    };

    try {
      if (!fs.lstatSync(flacFilePath).isFile() || !flacFilePath.match(/\.flac$/)) {
        result.status = 101;
        result.error = new TypeError(`${this.constructor.name}: Specified path ${flacFilePath} is not a file or does not have *.flac extension`);
      }
    } catch (error) {
      result.status = 102;
      result.error = new ReferenceError(
        `${this.constructor.name}: Cannot access file ${flacFilePath} (incorrect path?)`,
        { cause: error },
      );
    }

    let outputPathComputed: string | undefined;

    try {
      if (outputPath === undefined) {
        outputPathComputed = flacFilePath.replace(/\.flac$/, '.mp3');
      } else if (fs.lstatSync(outputPath).isDirectory()) {
        outputPathComputed = outputPath.replace(/\/+$/, path.sep) + path.basename(flacFilePath).replace(/\.flac$/, '.mp3');
      } else if (fs.lstatSync(outputPath).isFile()) {
        if (outputPath.match(/\.mp3$/)) {
          outputPathComputed = outputPath;
        } else {
          result.status = 103;
          result.error = new TypeError(`${this.constructor.name}: Specified output path ${outputPath} is a file but does not have *.mp3 extension`);
        }
      } else {
        result.status = 104;
        result.error = new TypeError(`${this.constructor.name}: Specified output path ${outputPath} is neither a file nor directory`);
      }
    } catch (error) {
      result.status = 105;
      result.error = new ReferenceError(
        `${this.constructor.name}: Cannot access file ${outputPath} (incorrect path?)`,
        { cause: error },
      );
    }

    if (result.status !== 0 || outputPathComputed === undefined) {
      return result;
    }

    result.outputPath = outputPathComputed;

    let bitrateOption = this.options.bitrateMethod.toString();
    switch (this.options.bitrateMethod) {
      default:
      case BitrateMethod.CBR:
        bitrateOption += ` -b${this.options.bitrateValue.toString()}`;
        break;
      case BitrateMethod.VBR:
        bitrateOption += ` -b${this.options.bitrateValueMinimum.toString()} -B${this.options.bitrateValueMaximum.toString()}`;
        break;
      case BitrateMethod.ABR:
        bitrateOption += ` ${this.options.bitrateValue.toString()}`;
        break;
    }

    const lameOptions = [
      bitrateOption,
      `-m ${this.options.channelMode.toString()}`,
      this.options.quality.toString(),
      this.options.replayGain.toString(),
    ];

    const lameOptionsJoined = lameOptions.join(' ');

    if (this.options.verbose) {
      logger.info(`Using following lame options: ${lameOptionsJoined}`);
    }

    let tagOptionsJoined = '';
    let flacImages : FlacImageBlockExport[] = [];

    if (this.options.transferTagEntries) {
      const flacTrackInfo = new BearTunesTagger({ verbose: this.options.verbose }).extractFlacTag(flacFilePath);

      const tagOptions = ['--add-id3v2'];
      if (flacTrackInfo.title) {
        tagOptions.push(`--tt "${flacTrackInfo.title}"`);
      }
      if (flacTrackInfo.artists && flacTrackInfo.artists.length > 0) {
        tagOptions.push(`--ta "${flacTrackInfo.artists.join(', ')}"`);
      }
      if (flacTrackInfo.genre) {
        tagOptions.push(`--tg "${flacTrackInfo.genre}"`);
      }
      if (flacTrackInfo.year) {
        tagOptions.push(`--ty "${flacTrackInfo.year}"`);
      }
      if (flacTrackInfo.released) {
        tagOptions.push(`--tv TORY=${formatLocalDateToIsoDateString(flacTrackInfo.released)}`);
      }

      if (flacTrackInfo.album) {
        if (flacTrackInfo.album.title) {
          tagOptions.push(`--tl "${flacTrackInfo.album.title}"`);
        }
        if (flacTrackInfo.album.trackNumber) {
          let albumNumbers = flacTrackInfo.album.trackNumber.toString();
          if (flacTrackInfo.album.trackTotal) {
            albumNumbers += `/${flacTrackInfo.album.trackTotal.toString()}`;
          }
          tagOptions.push(`--tn "${albumNumbers}"`);
        }
      }

      // lame codec supports only front cover option:
      flacImages = BearTunesTagger.extractArtworkFromFlac(flacFilePath, [FlacImageBlockType.CoverFront]);
      if (flacImages.length > 0) {
        tagOptions.push(`--ti "${flacImages[0].imagePath}"`);
      }

      tagOptionsJoined = (tagOptions.length > 1) ? tagOptions.join(' ') : ''; // length > 1 means there is at least one tag entry to set (the fist one is --add-id3v2)

      if (this.options.verbose) {
        logger.info(`Using following tag options: ${tagOptionsJoined}`);
      }
    }

    const childResult = childProcess.spawnSync(
      `flac --decode --stdout "${flacFilePath}" | lame ${lameOptionsJoined} ${tagOptionsJoined} - "${outputPathComputed}"`,
      { shell: true, stdio: 'inherit' },
    );

    flacImages.forEach((imageInfo) => imageInfo.imagePath && fs.unlinkSync(imageInfo.imagePath));

    if (childResult.status === null) {
      result.status = 106;
      result.error = new Error(`Convertion failed due to a signal: ${childResult.signal ?? 'signal is null'}`);
      return result;
    }

    if (deleteFlacAfterConvertion) {
      fs.unlinkSync(flacFilePath);
    }

    result.status = childResult.status;
    result.error = childResult.error;
    result.lameStdout = childResult.stdout?.toString();
    result.lameStderr = childResult.stderr?.toString();

    return result;
  }
}
