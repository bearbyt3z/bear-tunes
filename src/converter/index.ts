import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '#logger';
import {
  BearTunesTagger,
} from '#tagger';
import {
  executeCommandPipeline,
  normalizeUnknownError,
} from '#tools';

import {
  BitrateMethod,
  ConverterStatus,
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
  ConverterStatus,
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
      status: ConverterStatus.Success,
      error: undefined,
      encoderStdout: undefined,
      encoderStderr: undefined,
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
    status: ConverterStatus;
    error: Error | undefined;
  } {
    try {
      if (outputPath === undefined) {
        return {
          outputPathComputed: inputFilePath.replace(inputExtensionPattern, outputExtension),
          status: ConverterStatus.Success,
          error: undefined,
        };
      }

      if (fs.lstatSync(outputPath).isDirectory()) {
        return {
          outputPathComputed: outputPath.replace(/\/+$/, path.sep)
            + path.basename(inputFilePath).replace(inputExtensionPattern, outputExtension),
          status: ConverterStatus.Success,
          error: undefined,
        };
      }

      if (fs.lstatSync(outputPath).isFile()) {
        if (outputPath.match(expectedOutputExtensionPattern)) {
          return {
            outputPathComputed: outputPath,
            status: ConverterStatus.Success,
            error: undefined,
          };
        }

        return {
          outputPathComputed: undefined,
          status: ConverterStatus.InvalidOutputFileExtension,
          error: new TypeError(
            `${className}: Specified output path ${outputPath} is a file but does not have ${outputExtension} extension`,
          ),
        };
      }

      return {
        outputPathComputed: undefined,
        status: ConverterStatus.InvalidOutputPath,
        error: new TypeError(
          `${className}: Specified output path ${outputPath} is neither a file nor directory`,
        ),
      };
    } catch (error) {
      return {
        outputPathComputed: undefined,
        status: ConverterStatus.OutputPathAccessError,
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
    status: ConverterStatus;
    error: Error | undefined;
  } {
    try {
      if (!fs.lstatSync(inputFilePath).isFile() || !inputFilePath.match(expectedExtensionPattern)) {
        return {
          status: ConverterStatus.InvalidInputFile,
          error: new TypeError(
            `${className}: Specified path ${inputFilePath} is not a file or does not have ${expectedExtensionDescription} extension`,
          ),
        };
      }

      return {
        status: ConverterStatus.Success,
        error: undefined,
      };
    } catch (error) {
      return {
        status: ConverterStatus.InputFileAccessError,
        error: new ReferenceError(
          `${className}: Cannot access file ${inputFilePath} (incorrect path?)`,
          { cause: error },
        ),
      };
    }
  }

  private static tryDeleteFile(filePath: string, context: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      logger.warn(`${this.name}: Failed to delete ${context}: ${filePath}`, { error });
    }
  }

  private static finalizeChildProcessResult(
    result: BearTunesConverterResult,
    childResult: childProcess.SpawnSyncReturns<Buffer>,
    sourceFilePath: string,
    deleteSourceAfterConvertion: boolean,
  ): BearTunesConverterResult {
    result.encoderStdout = childResult.stdout?.toString();
    result.encoderStderr = childResult.stderr?.toString();

    if (childResult.status === null) {
      result.status = ConverterStatus.ConversionFailed;
      result.error = new Error(
        `Convertion failed due to a signal: ${childResult.signal ?? 'signal is null'}`,
      );
      return result;
    }

    if (childResult.status !== 0) {
      result.status = ConverterStatus.ConversionFailed;
      result.error = childResult.error
        ?? new Error(`Convertion failed with exit code: ${childResult.status.toString()}`);
      return result;
    }

    if (deleteSourceAfterConvertion) {
      BearTunesConverter.tryDeleteFile(sourceFilePath, 'source file');
    }

    result.status = ConverterStatus.Success;
    result.error = undefined;

    return result;
  }

  private buildLameArguments(): string[] {
    const result: string[] = [];

    switch (this.options.bitrateMethod) {
      default:
      case BitrateMethod.CBR:
        result.push(
          this.options.bitrateMethod.toString(),
          `-b${this.options.bitrateValue.toString()}`,
        );
        break;

      case BitrateMethod.VBR:
        result.push(
          this.options.bitrateMethod.toString(),
          `-b${this.options.bitrateValueMinimum.toString()}`,
          `-B${this.options.bitrateValueMaximum.toString()}`,
        );
        break;

      case BitrateMethod.ABR:
        result.push(
          this.options.bitrateMethod.toString(),
          this.options.bitrateValue.toString(),
        );
        break;
    }

    result.push(
      '-m',
      this.options.channelMode.toString(),
      this.options.quality.toString(),
      this.options.replayGain.toString(),
    );

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

    if (result.status !== ConverterStatus.Success) {
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

    if (result.status !== ConverterStatus.Success || outputPathComputed === undefined) {
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

  async flacToMp3(
    flacFilePath: string,
    outputPath: string | undefined = undefined,
    deleteFlacAfterConvertion = false,
  ): Promise<BearTunesConverterResult> {
    const result = BearTunesConverter.createEmptyConverterResult();

    const validatedInputFile = BearTunesConverter.validateInputFile(
      flacFilePath,
      /\.flac$/i,
      '*.flac',
      this.constructor.name,
    );

    result.status = validatedInputFile.status;
    result.error = validatedInputFile.error;

    if (result.status !== ConverterStatus.Success) {
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

    if (result.status !== ConverterStatus.Success || outputPathComputed === undefined) {
      return result;
    }

    result.outputPath = outputPathComputed;

    const lameArguments = this.buildLameArguments();
    const lameOptionsJoined = lameArguments.join(' ');

    if (this.options.verbose) {
      logger.info(`Using following lame options: ${lameOptionsJoined}`);
    }

    let tagArguments: string[] = [];
    let temporaryFiles: string[] = [];

    if (this.options.transferTagEntries) {
      const tagger = new BearTunesTagger({ verbose: this.options.verbose });
      const preparedTagTransfer = tagger.prepareMp3TagTransferFromFlac(flacFilePath);

      temporaryFiles = preparedTagTransfer.temporaryFiles;
      tagArguments = preparedTagTransfer.lameTagOptions;
    }

    try {
      const childResult = await executeCommandPipeline(
        {
          commandName: 'flac',
          args: ['--decode', '--stdout', flacFilePath],
        },
        {
          commandName: 'lame',
          args: [...lameArguments, ...tagArguments, '-', outputPathComputed],
        },
        {
          firstStdout: false,
          firstStderr: true,
          secondStdout: true,
          secondStderr: true,
        },
      );

      result.status = ConverterStatus.Success;
      result.error = undefined;
      result.encoderStdout = childResult.second.stdout?.toString('utf8');
      result.encoderStderr = childResult.second.stderr?.toString('utf8');

      if (deleteFlacAfterConvertion) {
        BearTunesConverter.tryDeleteFile(flacFilePath, 'source file');
      }

      return result;
    } catch (error) {
      result.status = ConverterStatus.ConversionFailed;
      result.error = normalizeUnknownError(error);
      result.encoderStdout = undefined;
      result.encoderStderr = undefined;

      return result;
    } finally {
      temporaryFiles.forEach((filePath) => {
        BearTunesConverter.tryDeleteFile(filePath, 'temporary tag transfer file');
      });
    }
  }
}
