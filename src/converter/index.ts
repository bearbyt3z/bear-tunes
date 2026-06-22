import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '#logger';
import {
  BearTunesTagger,
} from '#tagger';
import {
  CommandExecutionFailedError,
  CommandExecutionStartError,
  CommandPipelineInfrastructureError,
  executeCommandPipeline,
  executeCommandSync,
  normalizeUnknownError,
  FirstPipelineCommandFailedError,
  SecondPipelineCommandFailedError,
} from '#tools';

import {
  ConverterGuardError,
} from './errors.js';
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
   * This helper acts as a fail-fast guard for output path preconditions.
   * It returns the resolved output file path when resolution succeeds and throws
   * {@link ConverterGuardError} when the provided output path is inaccessible,
   * invalid, or uses an unexpected file extension.
   *
   * @param inputFilePath - Source file path used to derive the default output file path and file name.
   * @param outputPath - Optional output file path or output directory path provided by the caller.
   * @param inputExtensionPattern - Pattern matching the source file extension that should be replaced.
   * @param outputExtension - Output file extension to use when deriving the final output path.
   * @param expectedOutputExtensionPattern - Pattern matching valid output file paths for the target format.
   * @param callerName - Caller name used in generated error messages.
   * @returns The resolved output file path.
   * @throws {ConverterGuardError} When the output path is inaccessible, is neither
   * a file nor directory, or does not use the expected output extension.
   */
  private static resolveOutputPath(
    inputFilePath: string,
    outputPath: string | undefined,
    inputExtensionPattern: RegExp,
    outputExtension: string,
    expectedOutputExtensionPattern: RegExp,
    callerName: string,
  ): string {
    if (outputPath === undefined) {
      return inputFilePath.replace(inputExtensionPattern, outputExtension);
    }

    let outputPathStats: fs.Stats;

    try {
      outputPathStats = fs.lstatSync(outputPath);
    } catch (error) {
      throw new ConverterGuardError(
        BearTunesConverterFailureCode.OutputPathAccessError,
        new ReferenceError(
          `${callerName}: Cannot access output path ${outputPath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    if (outputPathStats.isDirectory()) {
      return outputPath.replace(/\/+$/, path.sep)
        + path.basename(inputFilePath).replace(inputExtensionPattern, outputExtension);
    }

    if (outputPathStats.isFile()) {
      if (outputPath.match(expectedOutputExtensionPattern)) {
        return outputPath;
      }

      throw new ConverterGuardError(
        BearTunesConverterFailureCode.InvalidOutputFileExtension,
        new TypeError(
          `${callerName}: Specified output path ${outputPath} is a file but does not have ${outputExtension} extension`,
        ),
      );
    }

    throw new ConverterGuardError(
      BearTunesConverterFailureCode.InvalidOutputPath,
      new TypeError(
        `${callerName}: Specified output path ${outputPath} is neither a file nor directory`,
      ),
    );
  }

  /**
   * Asserts that the input path points to an accessible file with the expected extension.
   *
   * This helper acts as a fail-fast guard for conversion preconditions.
   * It aborts the current conversion flow by throwing {@link ConverterGuardError}
   * when the input path cannot be accessed, does not point to a file, or does not
   * match the expected extension.
   *
   * If the method returns normally, the caller may continue conversion assuming
   * that the input file precondition has been satisfied.
   *
   * @param inputFilePath - Path to the source file to validate.
   * @param expectedExtensionPattern - Pattern matching the required input file extension.
   * @param expectedExtensionDescription - Human-readable description of accepted input extensions used in error messages.
   * @param callerName - Caller name used in generated error messages.
   * @throws {ConverterGuardError} When the input path is inaccessible, does not
   * point to a file, or does not match the expected extension.
   */
  private static assertValidInputFilePath(
    inputFilePath: string,
    expectedExtensionPattern: RegExp,
    expectedExtensionDescription: string,
    callerName: string,
  ): void {
    let inputFilePathStats: fs.Stats;

    try {
      inputFilePathStats = fs.lstatSync(inputFilePath);
    } catch (error) {
      throw new ConverterGuardError(
        BearTunesConverterFailureCode.InputFileAccessError,
        new ReferenceError(
          `${callerName}: Cannot access input path ${inputFilePath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    if (!inputFilePathStats.isFile() || !inputFilePath.match(expectedExtensionPattern)) {
      throw new ConverterGuardError(
        BearTunesConverterFailureCode.InvalidInputFile,
        new TypeError(
          `${callerName}: Specified path ${inputFilePath} is not a file or does not have ${expectedExtensionDescription} extension`,
        ),
      );
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
   * The method validates the input file, resolves the output file path, executes
   * the `flac` encoder synchronously, and maps the encoder outcome to a converter
   * result. On successful conversion, it may also delete the source AIFF file
   * when requested.
   *
   * Input file validation and output path resolution are performed internally
   * by fail-fast guard helpers. Any resulting {@link ConverterGuardError} is
   * caught within this method and mapped back to a
   * {@link BearTunesConverterFailureResult}, so callers continue to interact
   * with a result-based public API.
   *
   * Encoder execution is delegated to {@link executeCommandSync}. A
   * {@link CommandExecutionStartError} raised by that helper is mapped to
   * `EncoderProcessFailed`, while a {@link CommandExecutionFailedError} is
   * translated into either `EncoderProcessSignaled` or `EncoderProcessFailed`.
   * Any other unexpected execution error is normalized and mapped to
   * `EncoderProcessFailed`, while preserving captured encoder standard output
   * and standard error when available in the returned failure result.
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
    let resolvedOutputPath: string;

    try {
      BearTunesConverter.assertValidInputFilePath(
        aiffFilePath,
        /\.(aif|aiff)$/i,
        '*.aif or *.aiff',
        this.constructor.name,
      );

      resolvedOutputPath = BearTunesConverter.resolveOutputPath(
        aiffFilePath,
        outputPath,
        /\.(aif|aiff)$/i,
        '.flac',
        /\.flac$/i,
        this.constructor.name,
      );
    } catch (error) {
      if (error instanceof ConverterGuardError) {
        return BearTunesConverter.createFailureResult(
          error.failureCode,
          error.cause,
        );
      }

      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.UnexpectedPreparationError,
        normalizeUnknownError(error),
      );
    }

    try {
      const commandResult = executeCommandSync(
        'flac',
        ['--verify', '-8', '--force', '--output-name', resolvedOutputPath, aiffFilePath],
      );

      return BearTunesConverter.finalizeSuccessfulConversion(
        aiffFilePath,
        deleteAiffAfterConversion,
        resolvedOutputPath,
        commandResult.stdout?.toString(),
        commandResult.stderr?.toString(),
      );
    } catch (error) {
      if (error instanceof CommandExecutionStartError) {
        return BearTunesConverter.createFailureResult(
          BearTunesConverterFailureCode.EncoderProcessStartFailed,
          error,
        );
      }

      if (error instanceof CommandExecutionFailedError) {
        const encoderStdout = error.stdout?.toString();
        const encoderStderr = error.stderr?.toString();

        if (error.status === null) {
          return BearTunesConverter.createFailureResult(
            BearTunesConverterFailureCode.EncoderProcessSignaled,
            new Error(`Encoder process terminated by signal: ${error.signal ?? 'signal is null'}`),
            encoderStdout,
            encoderStderr,
          );
        }

        return BearTunesConverter.createFailureResult(
          BearTunesConverterFailureCode.EncoderProcessFailed,
          new Error(`Encoder process failed with exit code: ${error.status.toString()}`),
          encoderStdout,
          encoderStderr,
        );
      }

      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.UnexpectedSingleCommandExecutionError,
        normalizeUnknownError(error),
      );
    }
  }

  /**
   * Converts a FLAC file to an MP3 file, optionally preparing and transferring tag metadata.
   *
   * The method validates the input file, resolves the output file path, optionally prepares
   * tag transfer arguments, runs a `flac` to `lame` conversion pipeline, and maps the outcome
   * to a converter result. After a successful conversion, it may also delete the source FLAC
   * file when requested. Any temporary files created for tag transfer preparation are removed
   * before the method finishes.
   *
   * Input file validation and output path resolution are performed internally by fail-fast
   * guard helpers. Any resulting {@link ConverterGuardError} is caught within this method
   * and mapped to a {@link BearTunesConverterFailureResult}, so callers continue to interact
   * with a result-based public API.
   *
   * Pipeline execution is delegated to {@link executeCommandPipeline}. Any
   * {@link CommandPipelineInfrastructureError} raised by that helper is mapped to
   * `ConversionPipelineFailed`, while command-specific non-zero exits are mapped to
   * `FlacDecodeProcessFailed` or `LameEncodeProcessFailed`.
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
    let resolvedOutputPath: string;

    try {
      BearTunesConverter.assertValidInputFilePath(
        flacFilePath,
        /\.flac$/i,
        '*.flac',
        this.constructor.name,
      );

      resolvedOutputPath = BearTunesConverter.resolveOutputPath(
        flacFilePath,
        outputPath,
        /\.flac$/i,
        '.mp3',
        /\.mp3$/i,
        this.constructor.name,
      );
    } catch (error) {
      if (error instanceof ConverterGuardError) {
        return BearTunesConverter.createFailureResult(
          error.failureCode,
          error.cause,
        );
      }

      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.UnexpectedPreparationError,
        normalizeUnknownError(error),
      );
    }

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

      if (error instanceof CommandPipelineInfrastructureError) {
        return BearTunesConverter.createFailureResult(
          BearTunesConverterFailureCode.ConversionPipelineInfrastructureFailed,
          error,
        );
      }

      return BearTunesConverter.createFailureResult(
        BearTunesConverterFailureCode.UnexpectedPipelineExecutionError,
        normalizeUnknownError(error),
      );
    } finally {
      tagTransferTemporaryFiles.forEach((filePath) => {
        BearTunesConverter.tryDeleteFile(filePath, 'temporary tag transfer file');
      });
    }
  }
}
