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
  BearTunesConverterStatus,
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
  BearTunesConverterStatus,
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

/**
 * Converts supported audio files between formats used by BearTunes.
 */
export class BearTunesConverter {
  /**
   * Effective converter configuration for this instance.
   */
  private readonly options: BearTunesConverterOptions;

  /**
   * Creates a converter instance with merged default and custom options.
   *
   * @param options - Partial converter configuration overriding default values.
   */
  constructor(options: Partial<BearTunesConverterOptions> = {}) {
    this.options = {
      ...defaultConverterOptions,
      ...options,
    };
  }

  /**
   * Creates an empty conversion result initialized with default success state.
   *
   * @returns Empty converter result object.
   */
  private static createEmptyConverterResult(): BearTunesConverterResult {
    return {
      status: BearTunesConverterStatus.Success,
      error: undefined,
      encoderStdout: undefined,
      encoderStderr: undefined,
      outputPath: undefined,
    };
  }

  /**
   * Resolves the final output path for a conversion operation.
   *
   * @param inputFilePath - Source file path used as the default output path base.
   * @param outputPath - Optional output file or directory path provided by the caller.
   * @param inputExtensionPattern - Pattern matching the source file extension.
   * @param outputExtension - Expected output file extension.
   * @param expectedOutputExtensionPattern - Pattern matching the allowed output file extension.
   * @param className - Class name used in generated error messages.
   * @returns Resolved output path together with status and optional error details.
   */
  private static resolveOutputPath(
    inputFilePath: string,
    outputPath: string | undefined,
    inputExtensionPattern: RegExp,
    outputExtension: string,
    expectedOutputExtensionPattern: RegExp,
    className: string,
  ): {
    outputPathComputed: string | undefined;
    status: BearTunesConverterStatus;
    error: Error | undefined;
  } {
    try {
      if (outputPath === undefined) {
        return {
          outputPathComputed: inputFilePath.replace(inputExtensionPattern, outputExtension),
          status: BearTunesConverterStatus.Success,
          error: undefined,
        };
      }

      if (fs.lstatSync(outputPath).isDirectory()) {
        return {
          outputPathComputed: outputPath.replace(/\/+$/, path.sep)
            + path.basename(inputFilePath).replace(inputExtensionPattern, outputExtension),
          status: BearTunesConverterStatus.Success,
          error: undefined,
        };
      }

      if (fs.lstatSync(outputPath).isFile()) {
        if (outputPath.match(expectedOutputExtensionPattern)) {
          return {
            outputPathComputed: outputPath,
            status: BearTunesConverterStatus.Success,
            error: undefined,
          };
        }

        return {
          outputPathComputed: undefined,
          status: BearTunesConverterStatus.InvalidOutputFileExtension,
          error: new TypeError(
            `${className}: Specified output path ${outputPath} is a file but does not have ${outputExtension} extension`,
          ),
        };
      }

      return {
        outputPathComputed: undefined,
        status: BearTunesConverterStatus.InvalidOutputPath,
        error: new TypeError(
          `${className}: Specified output path ${outputPath} is neither a file nor directory`,
        ),
      };
    } catch (error) {
      return {
        outputPathComputed: undefined,
        status: BearTunesConverterStatus.OutputPathAccessError,
        error: new ReferenceError(
          `${className}: Cannot access file ${outputPath} (incorrect path?)`,
          { cause: error },
        ),
      };
    }
  }

  /**
   * Validates that the input path points to an accessible file with the expected extension.
   *
   * @param inputFilePath - Path to the source file.
   * @param expectedExtensionPattern - Pattern matching the required input extension.
   * @param expectedExtensionDescription - Human-readable description of accepted extensions.
   * @param className - Class name used in generated error messages.
   * @returns Validation status together with optional error details.
   */
  private static validateInputFile(
    inputFilePath: string,
    expectedExtensionPattern: RegExp,
    expectedExtensionDescription: string,
    className: string,
  ): {
    status: BearTunesConverterStatus;
    error: Error | undefined;
  } {
    try {
      if (!fs.lstatSync(inputFilePath).isFile() || !inputFilePath.match(expectedExtensionPattern)) {
        return {
          status: BearTunesConverterStatus.InvalidInputFile,
          error: new TypeError(
            `${className}: Specified path ${inputFilePath} is not a file or does not have ${expectedExtensionDescription} extension`,
          ),
        };
      }

      return {
        status: BearTunesConverterStatus.Success,
        error: undefined,
      };
    } catch (error) {
      return {
        status: BearTunesConverterStatus.InputFileAccessError,
        error: new ReferenceError(
          `${className}: Cannot access file ${inputFilePath} (incorrect path?)`,
          { cause: error },
        ),
      };
    }
  }

  /**
   * Tries to delete a file and logs a warning when the operation fails.
   *
   * @param filePath - Path to the file that should be removed.
   * @param context - Short label describing the file purpose in log messages.
   */
  private static tryDeleteFile(filePath: string, context: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      logger.warn(`${this.name}: Failed to delete ${context}: ${filePath}`, { error });
    }
  }

  /**
   * Finalizes a synchronous child process result and maps it to converter result fields.
   *
   * @param result - Converter result object to update.
   * @param childResult - Raw result returned by the child process execution.
   * @param sourceFilePath - Source file path that may be deleted after successful conversion.
   * @param deleteSourceAfterConversion - Whether the source file should be removed on success.
   * @returns Updated converter result object.
   */
  private static finalizeChildProcessResult(
    result: BearTunesConverterResult,
    childResult: childProcess.SpawnSyncReturns<Buffer>,
    sourceFilePath: string,
    deleteSourceAfterConversion: boolean,
  ): BearTunesConverterResult {
    result.encoderStdout = childResult.stdout?.toString();
    result.encoderStderr = childResult.stderr?.toString();

    if (childResult.status === null) {
      result.status = BearTunesConverterStatus.ConversionFailed;
      result.error = new Error(
        `Conversion failed due to a signal: ${childResult.signal ?? 'signal is null'}`,
      );
      return result;
    }

    if (childResult.status !== 0) {
      result.status = BearTunesConverterStatus.ConversionFailed;
      result.error = childResult.error
        ?? new Error(`Conversion failed with exit code: ${childResult.status.toString()}`);
      return result;
    }

    if (deleteSourceAfterConversion) {
      BearTunesConverter.tryDeleteFile(sourceFilePath, 'source file');
    }

    result.status = BearTunesConverterStatus.Success;
    result.error = undefined;

    return result;
  }

  /**
   * Builds command-line arguments for the MP3 encoder from current converter options.
   *
   * @returns Encoder arguments ready to be passed to the LAME process.
   */
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

  /**
   * Converts an AIFF file to FLAC.
   *
   * @param aiffFilePath - Path to the source AIFF file.
   * @param outputPath - Optional target FLAC file path or output directory.
   * @param deleteAiffAfterConversion - Whether the source AIFF file should be deleted after successful conversion.
   * @returns Result describing the conversion outcome.
   */
  aiffToFlac(
    aiffFilePath: string,
    outputPath: string | undefined = undefined,
    deleteAiffAfterConversion = false,
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

    if (result.status !== BearTunesConverterStatus.Success) {
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

    if (result.status !== BearTunesConverterStatus.Success || outputPathComputed === undefined) {
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
      deleteAiffAfterConversion,
    );
  }

  /**
   * Converts a FLAC file to MP3.
   *
   * @param flacFilePath - Path to the source FLAC file.
   * @param outputPath - Optional target MP3 file path or output directory.
   * @param deleteFlacAfterConversion - Whether the source FLAC file should be deleted after successful conversion.
   * @returns Promise resolved with the conversion result.
   */
  async flacToMp3(
    flacFilePath: string,
    outputPath: string | undefined = undefined,
    deleteFlacAfterConversion = false,
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

    if (result.status !== BearTunesConverterStatus.Success) {
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

    if (result.status !== BearTunesConverterStatus.Success || outputPathComputed === undefined) {
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

      result.status = BearTunesConverterStatus.Success;
      result.error = undefined;
      result.encoderStdout = childResult.second.stdout?.toString('utf8');
      result.encoderStderr = childResult.second.stderr?.toString('utf8');

      if (deleteFlacAfterConversion) {
        BearTunesConverter.tryDeleteFile(flacFilePath, 'source file');
      }

      return result;
    } catch (error) {
      result.status = BearTunesConverterStatus.ConversionFailed;
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
