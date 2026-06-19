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
  FirstPipelineCommandFailedError,
  SecondPipelineCommandFailedError,
} from '#tools';

import {
  Mp3BitrateMode,
  BearTunesConverterFailureCode,
  LameQuality,
  Mp3ChannelMode,
  ReplayGainMode,
} from './types.js';

import type {
  BearTunesConverterFailureResult,
  BearTunesConverterOptions,
  BearTunesConverterResult,
  BearTunesConverterSuccessResult,
} from './types.js';

// reexporting enums & types, so they will be included in the converter import
export {
  Mp3BitrateMode,
  BearTunesConverterFailureCode,
  LameQuality,
  Mp3ChannelMode,
  ReplayGainMode,
};

export type {
  BearTunesConverterFailureResult,
  BearTunesConverterOptions,
  BearTunesConverterResult,
  BearTunesConverterSuccessResult,
};

/**
 * Default converter options applied when custom options are not provided.
 */
// Default options are intentionally defined as immutable:
// - `as const` keeps exact literal types and readonly fields,
// - `satisfies` checks compatibility with the public options type,
// - `Object.freeze()` guards against accidental mutation at runtime.
const defaultConverterOptions = Object.freeze({
  mp3BitrateMode: Mp3BitrateMode.CBR,
  mp3BitrateKbps: 320,
  mp3VbrMinBitrateKbps: 256,
  mp3VbrMaxBitrateKbps: 320,
  // `LameQuality.Q1` is used as the default because it offers a conservative
  // high-quality setting and has produced more consistent high-frequency
  // spectrum results in practical testing than `LameQuality.Q0`.
  lameQuality: LameQuality.Q1,
  mp3ChannelMode: Mp3ChannelMode.JointStereo,
  replayGainMode: ReplayGainMode.Accurate,
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
   * Creates a success result describing a completed conversion.
   *
   * @param outputPath - Resolved path of the successfully produced output file.
   * @param encoderStdout - Standard output captured from the encoder process, when available.
   * @param encoderStderr - Standard error captured from the encoder process, when available.
   * @returns A converter success result with `ok` set to `true`.
   */
  private static createSuccessResult(
    outputPath: string,
    encoderStdout?: string,
    encoderStderr?: string,
  ): BearTunesConverterSuccessResult {
    return { ok: true, outputPath, encoderStdout, encoderStderr };
  }

  /**
   * Creates a failure result describing an unsuccessful conversion.
   *
   * @param failureCode - Domain-specific code classifying the conversion failure.
   * @param error - Error object describing the failure cause.
   * @param encoderStdout - Standard output captured from the encoder process, when available.
   * @param encoderStderr - Standard error captured from the encoder process, when available.
   * @returns A converter failure result with `ok` set to `false`.
   */
  private static createFailureResult(
    failureCode: BearTunesConverterFailureCode,
    error: Error,
    encoderStdout?: string,
    encoderStderr?: string,
  ): BearTunesConverterFailureResult {
    return { ok: false, failureCode, error, encoderStdout, encoderStderr };
  }

  /**
   * Resolves the output file path to use for a conversion operation.
   *
   * If `outputPath` is not provided, the method derives the output path from
   * `inputFilePath` by replacing the input extension with `outputExtension`.
   *
   * If `outputPath` points to a directory, the method appends the converted input
   * file name to that directory. If it points to a file, the method validates that
   * the file path uses the expected output extension.
   *
   * @param inputFilePath - Source file path used to derive the default output file path and file name.
   * @param outputPath - Optional output file path or output directory path provided by the caller.
   * @param inputExtensionPattern - Pattern matching the source file extension that should be replaced.
   * @param outputExtension - Output file extension to use when deriving the final output path.
   * @param expectedOutputExtensionPattern - Pattern matching valid output file paths for the target format.
   * @param callerName - Caller name used in generated error messages.
   * @returns The resolved output file path, or a {@link BearTunesConverterFailureResult}
   * describing why output path resolution failed.
   */
  private static resolveOutputPath(
    inputFilePath: string,
    outputPath: string | undefined,
    inputExtensionPattern: RegExp,
    outputExtension: string,
    expectedOutputExtensionPattern: RegExp,
    callerName: string,
  ): string | BearTunesConverterFailureResult {
    try {
      if (outputPath === undefined) {
        return inputFilePath.replace(inputExtensionPattern, outputExtension);
      }

      const outputPathStats = fs.lstatSync(outputPath);

      if (outputPathStats.isDirectory()) {
        return outputPath.replace(/\/+$/, path.sep)
          + path.basename(inputFilePath).replace(inputExtensionPattern, outputExtension);
      }

      if (outputPathStats.isFile()) {
        if (outputPath.match(expectedOutputExtensionPattern)) {
          return outputPath;
        }

        return BearTunesConverter.createFailureResult(
          BearTunesConverterFailureCode.InvalidOutputFileExtension,
          new TypeError(
            `${callerName}: Specified output path ${outputPath} is a file but does not have ${outputExtension} extension`,
          ),
        );
      }

      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.InvalidOutputPath,
        new TypeError(
          `${callerName}: Specified output path ${outputPath} is neither a file nor directory`,
        ),
      );
    } catch (error) {
      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.OutputPathAccessError,
        new ReferenceError(
          `${callerName}: Cannot access file ${outputPath} (incorrect path?)`,
          { cause: error },
        ),
      );
    }
  }

  /**
   * Validates that the input path points to an accessible file with the expected extension.
   *
   * The method checks both filesystem accessibility and whether the referenced path
   * is a file whose name matches the expected input extension pattern.
   *
   * @param inputFilePath - Path to the source file to validate.
   * @param expectedExtensionPattern - Pattern matching the required input file extension.
   * @param expectedExtensionDescription - Human-readable description of accepted input extensions used in error messages.
   * @param callerName - Caller name used in generated error messages.
   * @returns `null` when the input file path is valid, or a
   * {@link BearTunesConverterFailureResult} describing why validation failed.
   */
  private static getInputFileValidationFailure(
    inputFilePath: string,
    expectedExtensionPattern: RegExp,
    expectedExtensionDescription: string,
    callerName: string,
  ): BearTunesConverterFailureResult | undefined {
    try {
      const inputFilePathStats = fs.lstatSync(inputFilePath);

      if (!inputFilePathStats.isFile() || !inputFilePath.match(expectedExtensionPattern)) {
        return BearTunesConverter.createFailureResult(
          BearTunesConverterFailureCode.InvalidInputFile,
          new TypeError(
            `${callerName}: Specified path ${inputFilePath} is not a file or does not have ${expectedExtensionDescription} extension`,
          ),
        );
      }

      return undefined;
    } catch (error) {
      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.InputFileAccessError,
        new ReferenceError(
          `${callerName}: Cannot access file ${inputFilePath} (incorrect path?)`,
          { cause: error },
        ),
      );
    }
  }

  /**
   * Checks whether a helper result represents a converter failure result.
   *
   * This type guard is used to narrow helper return values that may contain either
   * a resolved string value, a converter failure result, or `null`.
   *
   * @param result - Helper result to inspect.
   * @returns `true` when `result` is a {@link BearTunesConverterFailureResult},
   * otherwise `false`.
   */
  private static isFailureResult(
    result: string | BearTunesConverterFailureResult | null,
  ): result is BearTunesConverterFailureResult {
    return result !== null && typeof result !== 'string' && result.ok === false;
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
   * Finalizes a successful conversion by optionally deleting the source file
   * and returning a converter success result.
   *
   * @param sourceFilePath - Source file path that may be deleted after successful conversion.
   * @param deleteSourceAfterConversion - Whether the source file should be removed after a successful conversion.
   * @param outputPath - Resolved path of the successfully produced output file.
   * @param encoderStdout - Standard output captured from the encoder process, when available.
   * @param encoderStderr - Standard error captured from the encoder process, when available.
   * @returns A converter success result with `ok` set to `true`.
   */
  private static finalizeSuccessfulConversion(
    sourceFilePath: string,
    deleteSourceAfterConversion: boolean,
    outputPath: string,
    encoderStdout?: string,
    encoderStderr?: string,
  ): BearTunesConverterSuccessResult {
    if (deleteSourceAfterConversion) {
      BearTunesConverter.tryDeleteFile(sourceFilePath, 'source file');
    }

    return BearTunesConverter.createSuccessResult(
      outputPath,
      encoderStdout,
      encoderStderr,
    );
  }

  /**
   * Handles the result of a completed encoder process and maps it to a converter result.
   *
   * The method converts process termination details and captured output streams into
   * either a success result or a failure result.
   *
   * @param childResult - Raw result returned by the synchronous child process execution.
   * @param sourceFilePath - Source file path that may be deleted after successful conversion.
   * @param deleteSourceAfterConversion - Whether the source file should be removed after a successful conversion.
   * @param outputPath - Resolved output file path to include in the success result.
   * @returns A converter result describing whether the encoder process succeeded, failed with
   * a non-zero exit status, or was terminated by a signal.
   */
  private static handleEncoderProcessResult(
    childResult: childProcess.SpawnSyncReturns<Buffer>,
    sourceFilePath: string,
    deleteSourceAfterConversion: boolean,
    outputPath: string,
  ): BearTunesConverterResult {
    const encoderStdout = childResult.stdout?.toString();
    const encoderStderr = childResult.stderr?.toString();

    if (childResult.status === null) {
      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.EncoderProcessSignaled,
        new Error(`Encoder process terminated by signal: ${childResult.signal ?? 'signal is null'}`),
        encoderStdout,
        encoderStderr,
      );
    }

    if (childResult.status !== 0) {
      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.EncoderProcessFailed,
        childResult.error ?? new Error(`Encoder process failed with exit code: ${childResult.status.toString()}`),
        encoderStdout,
        encoderStderr,
      );
    }

    return BearTunesConverter.finalizeSuccessfulConversion(
      sourceFilePath,
      deleteSourceAfterConversion,
      outputPath,
      encoderStdout,
      encoderStderr,
    );
  }

  /**
   * Builds command-line arguments for the MP3 encoder from current converter options.
   *
   * @returns Encoder arguments ready to be passed to the LAME process.
   */
  private buildLameArguments(): string[] {
    const result: string[] = [];

    switch (this.options.mp3BitrateMode) {
      default:
      case Mp3BitrateMode.CBR:
        result.push(
          this.options.mp3BitrateMode.toString(),
          `-b${this.options.mp3BitrateKbps.toString()}`,
        );
        break;

      case Mp3BitrateMode.VBR:
        result.push(
          this.options.mp3BitrateMode.toString(),
          `-b${this.options.mp3VbrMinBitrateKbps.toString()}`,
          `-B${this.options.mp3VbrMaxBitrateKbps.toString()}`,
        );
        break;

      case Mp3BitrateMode.ABR:
        result.push(
          this.options.mp3BitrateMode.toString(),
          this.options.mp3BitrateKbps.toString(),
        );
        break;
    }

    result.push(
      '-m',
      this.options.mp3ChannelMode.toString(),
      this.options.lameQuality.toString(),
      this.options.replayGainMode.toString(),
    );

    return result;
  }

  /**
   * Converts an AIFF file to a FLAC file.
   *
   * The method validates the input file, resolves the output file path, runs the
   * `flac` encoder synchronously, and maps the encoder result to a converter result.
   * On successful conversion, it may also delete the source AIFF file when requested.
   *
   * @param aiffFilePath - Path to the source AIFF file to convert.
   * @param outputPath - Optional target FLAC file path or output directory path.
   * @param deleteAiffAfterConversion - Whether the source AIFF file should be deleted after a successful conversion.
   * @returns A converter result describing whether the conversion succeeded or why it failed.
   */
  aiffToFlac(
    aiffFilePath: string,
    outputPath: string | undefined = undefined,
    deleteAiffAfterConversion = false,
  ): BearTunesConverterResult {
    const inputValidationFailure = BearTunesConverter.getInputFileValidationFailure(
      aiffFilePath,
      /\.(aif|aiff)$/i,
      '*.aif or *.aiff',
      this.constructor.name,
    );

    if (inputValidationFailure) {
      return inputValidationFailure;
    }

    const resolvedOutputPathOrFailure = BearTunesConverter.resolveOutputPath(
      aiffFilePath,
      outputPath,
      /\.(aif|aiff)$/i,
      '.flac',
      /\.flac$/i,
      this.constructor.name,
    );

    if (BearTunesConverter.isFailureResult(resolvedOutputPathOrFailure)) {
      return resolvedOutputPathOrFailure;
    }

    const resolvedOutputPath = resolvedOutputPathOrFailure;

    const childResult = childProcess.spawnSync(
      'flac',
      ['--verify', '-8', '--force', '--output-name', resolvedOutputPath, aiffFilePath],
      { stdio: 'inherit' },
    );

    return BearTunesConverter.handleEncoderProcessResult(
      childResult,
      aiffFilePath,
      deleteAiffAfterConversion,
      resolvedOutputPath,
    );
  }

  /**
   * Converts a FLAC file to an MP3 file, optionally preparing and transferring tag metadata.
   *
   * The method validates the input file, resolves the output file path, optionally prepares
   * tag transfer arguments, runs a `flac` to `lame` conversion pipeline, and maps the pipeline
   * result to a converter result. On successful conversion, it may also delete the source FLAC
   * file when requested. Any temporary files created for tag transfer preparation are removed
   * before the method finishes.
   *
   * @param flacFilePath - Path to the source FLAC file to convert.
   * @param outputPath - Optional target MP3 file path or output directory path.
   * @param deleteFlacAfterConversion - Whether the source FLAC file should be deleted after a successful conversion.
   * @returns A promise resolved with a converter result describing whether the conversion succeeded or why it failed.
   */
  async flacToMp3(
    flacFilePath: string,
    outputPath: string | undefined = undefined,
    deleteFlacAfterConversion = false,
  ): Promise<BearTunesConverterResult> {
    const inputValidationFailure = BearTunesConverter.getInputFileValidationFailure(
      flacFilePath,
      /\.flac$/i,
      '*.flac',
      this.constructor.name,
    );

    if (inputValidationFailure) {
      return inputValidationFailure;
    }

    const resolvedOutputPathOrFailure = BearTunesConverter.resolveOutputPath(
      flacFilePath,
      outputPath,
      /\.flac$/i,
      '.mp3',
      /\.mp3$/i,
      this.constructor.name,
    );

    if (BearTunesConverter.isFailureResult(resolvedOutputPathOrFailure)) {
      return resolvedOutputPathOrFailure;
    }

    const resolvedOutputPath = resolvedOutputPathOrFailure;

    const lameArguments = this.buildLameArguments();
    const lameOptionsJoined = lameArguments.join(' ');

    if (this.options.verbose) {
      logger.info(`Using LAME options: ${lameOptionsJoined}`);
    }

    let lameTagArguments: string[] = [];
    let tagTransferTemporaryFiles: string[] = [];

    if (this.options.transferTagEntries) {
      try {
        const tagger = new BearTunesTagger({ verbose: this.options.verbose });
        const preparedTagTransferResult = tagger.prepareMp3TagTransferFromFlac(flacFilePath);

        tagTransferTemporaryFiles = preparedTagTransferResult.temporaryFiles;
        lameTagArguments = preparedTagTransferResult.lameTagOptions;
      } catch (error) {
        return BearTunesConverter.createFailureResult(
          BearTunesConverterFailureCode.TagTransferPreparationFailed,
          normalizeUnknownError(error),
        );
      }
    }

    try {
      const childResult = await executeCommandPipeline(
        {
          commandName: 'flac',
          args: ['--decode', '--stdout', flacFilePath],
        },
        {
          commandName: 'lame',
          args: [...lameArguments, ...lameTagArguments, '-', resolvedOutputPath],
        },
        {
          firstStdout: false,
          firstStderr: true,
          secondStdout: true,
          secondStderr: true,
        },
      );

      return BearTunesConverter.finalizeSuccessfulConversion(
        flacFilePath,
        deleteFlacAfterConversion,
        resolvedOutputPath,
        childResult.second.stdout?.toString('utf8'),
        childResult.second.stderr?.toString('utf8'),
      );
    } catch (error) {
      if (error instanceof FirstPipelineCommandFailedError) {
        return BearTunesConverter.createFailureResult(
          BearTunesConverterFailureCode.FlacDecodeProcessFailed,
          error,
        );
      }

      if (error instanceof SecondPipelineCommandFailedError) {
        return BearTunesConverter.createFailureResult(
          BearTunesConverterFailureCode.LameEncodeProcessFailed,
          error,
        );
      }

      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.ConversionPipelineFailed,
        normalizeUnknownError(error),
      );
    } finally {
      tagTransferTemporaryFiles.forEach((filePath) => {
        BearTunesConverter.tryDeleteFile(filePath, 'temporary tag transfer file');
      });
    }
  }
}
