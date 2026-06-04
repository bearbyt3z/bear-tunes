import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '#logger';
import {
  BearTunesTagger,
} from '#tagger';

import {
  BitrateMethod,
  Quality,
  ChannelMode,
  ReplayGain,
} from './types.js';

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

  private static createEmptyConverterResult(): BearTunesConverterResult {
    return {
      status: 0,
      error: undefined,
      lameStdout: undefined,
      lameStderr: undefined,
      outputPath: undefined,
    };
  }

  private static resolveOutputPath(
    inputFilePath: string,
    outputPath: string | undefined,
    inputExtensionPattern: RegExp,
    outputExtension: string,
    expectedOutputExtensionPattern: RegExp,
    className: string,
  ): {
    outputPathComputed: string | undefined;
    status: number;
    error: Error | undefined;
  } {
    try {
      if (outputPath === undefined) {
        return {
          outputPathComputed: inputFilePath.replace(inputExtensionPattern, outputExtension),
          status: 0,
          error: undefined,
        };
      }

      if (fs.lstatSync(outputPath).isDirectory()) {
        return {
          outputPathComputed: outputPath.replace(/\/+$/, path.sep)
            + path.basename(inputFilePath).replace(inputExtensionPattern, outputExtension),
          status: 0,
          error: undefined,
        };
      }

      if (fs.lstatSync(outputPath).isFile()) {
        if (outputPath.match(expectedOutputExtensionPattern)) {
          return {
            outputPathComputed: outputPath,
            status: 0,
            error: undefined,
          };
        }

        return {
          outputPathComputed: undefined,
          status: 103,
          error: new TypeError(
            `${className}: Specified output path ${outputPath} is a file but does not have ${outputExtension} extension`,
          ),
        };
      }

      return {
        outputPathComputed: undefined,
        status: 104,
        error: new TypeError(
          `${className}: Specified output path ${outputPath} is neither a file nor directory`,
        ),
      };
    } catch (error) {
      return {
        outputPathComputed: undefined,
        status: 105,
        error: new ReferenceError(
          `${className}: Cannot access file ${outputPath} (incorrect path?)`,
          { cause: error },
        ),
      };
    }
  }

  private static validateInputFile(
    inputFilePath: string,
    expectedExtensionPattern: RegExp,
    expectedExtensionDescription: string,
    className: string,
  ): {
    status: number;
    error: Error | undefined;
  } {
    try {
      if (!fs.lstatSync(inputFilePath).isFile() || !inputFilePath.match(expectedExtensionPattern)) {
        return {
          status: 101,
          error: new TypeError(
            `${className}: Specified path ${inputFilePath} is not a file or does not have ${expectedExtensionDescription} extension`,
          ),
        };
      }

      return {
        status: 0,
        error: undefined,
      };
    } catch (error) {
      return {
        status: 102,
        error: new ReferenceError(
          `${className}: Cannot access file ${inputFilePath} (incorrect path?)`,
          { cause: error },
        ),
      };
    }
  }

  private static finalizeChildProcessResult(
    result: BearTunesConverterResult,
    childResult: childProcess.SpawnSyncReturns<Buffer>,
    sourceFilePath: string,
    deleteSourceAfterConvertion: boolean,
  ): BearTunesConverterResult {
    if (childResult.status === null) {
      result.status = 106;
      result.error = new Error(`Convertion failed due to a signal: ${childResult.signal ?? 'signal is null'}`);
      return result;
    }

    if (childResult.status === 0 && deleteSourceAfterConvertion) {
      fs.unlinkSync(sourceFilePath);
    }

    result.status = childResult.status;
    result.error = childResult.error;
    result.lameStdout = childResult.stdout?.toString();
    result.lameStderr = childResult.stderr?.toString();

    return result;
  }

  aiffToFlac(
    aiffFilePath: string,
    outputPath: string | undefined = undefined,
    deleteAiffAfterConvertion = false,
  ): BearTunesConverterResult {
    const result = BearTunesConverter.createEmptyConverterResult();

    const validatedInputFile = BearTunesConverter.validateInputFile(
      aiffFilePath,
      /\.(aif|aiff)$/i,
      '*.aif or *.aiff',
      this.constructor.name,
    );

    result.status = validatedInputFile.status;
    result.error = validatedInputFile.error;

    if (result.status !== 0) {
      return result;
    }

    const resolvedOutputPath = BearTunesConverter.resolveOutputPath(
      aiffFilePath,
      outputPath,
      /\.(aif|aiff)$/i,
      '.flac',
      /\.flac$/i,
      this.constructor.name,
    );

    const outputPathComputed = resolvedOutputPath.outputPathComputed;
    result.status = resolvedOutputPath.status;
    result.error = resolvedOutputPath.error;

    if (result.status !== 0 || outputPathComputed === undefined) {
      return result;
    }

    result.outputPath = outputPathComputed;

    const childResult = childProcess.spawnSync(
      'flac',
      ['--verify', '-8', '--force', '--output-name', outputPathComputed, aiffFilePath],
      { stdio: 'inherit' },
    );

    return BearTunesConverter.finalizeChildProcessResult(
      result,
      childResult,
      aiffFilePath,
      deleteAiffAfterConvertion,
    );
  }

  flacToMp3(flacFilePath: string, outputPath: string | undefined = undefined, deleteFlacAfterConvertion = false): BearTunesConverterResult {
    const result = BearTunesConverter.createEmptyConverterResult();

    const validatedInputFile = BearTunesConverter.validateInputFile(
      flacFilePath,
      /\.flac$/i,
      '*.flac',
      this.constructor.name,
    );

    result.status = validatedInputFile.status;
    result.error = validatedInputFile.error;

    if (result.status !== 0) {
      return result;
    }

    const resolvedOutputPath = BearTunesConverter.resolveOutputPath(
      flacFilePath,
      outputPath,
      /\.flac$/i,
      '.mp3',
      /\.mp3$/i,
      this.constructor.name,
    );

    const outputPathComputed = resolvedOutputPath.outputPathComputed;
    result.status = resolvedOutputPath.status;
    result.error = resolvedOutputPath.error;

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
    let temporaryFiles: string[] = [];

    if (this.options.transferTagEntries) {
      const tagger = new BearTunesTagger({ verbose: this.options.verbose });
      const preparedTagTransfer = tagger.prepareMp3TagTransferFromFlac(flacFilePath);

      temporaryFiles = preparedTagTransfer.temporaryFiles;
      tagOptionsJoined = preparedTagTransfer.lameTagOptions.join(' ');
    }

    try {
      const childResult = childProcess.spawnSync(
        `flac --decode --stdout "${flacFilePath}" | lame ${lameOptionsJoined} ${tagOptionsJoined} - "${outputPathComputed}"`,
        { shell: true, stdio: 'inherit' },
      );

      return BearTunesConverter.finalizeChildProcessResult(
        result,
        childResult,
        flacFilePath,
        deleteFlacAfterConvertion,
      );
    } finally {
      temporaryFiles.forEach((filePath) => fs.unlinkSync(filePath));
    }
  }
}
