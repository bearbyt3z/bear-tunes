/**
 * Public API for BearTunes audio conversion.
 *
 * Exposes the converter, its configuration and result types, and conversion
 * option and failure-code enums. Filesystem validation, encoder command
 * construction, pipeline execution, and tag transfer remain internal details.
 *
 * @module converter
 */

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
  FirstPipelineCommandFailedError,
  isErrorWithStringCode,
  normalizeTrailingPathSeparators,
  normalizeUnknownError,
  SecondPipelineCommandFailedError,
} from '#tools';

import {
  ConverterGuardError,
} from './errors.js';
import {
  BearTunesConverterFailureCode,
  LameQuality,
  Mp3BitrateMode,
  Mp3ChannelMode,
  ReplayGainMode,
} from './types.js';

import type {
  BearTunesConverterFailureResult,
  BearTunesConverterOptions,
  BearTunesConverterResult,
  BearTunesConverterSuccessResult,
} from './types.js';

export {
  BearTunesConverterFailureCode,
  LameQuality,
  Mp3BitrateMode,
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
  forceOverwriteOutputFile: false,
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
   * Asserts that conversion may write to the resolved output file path.
   *
   * A nonexistent output file may always be created. An existing regular file
   * may be replaced only when {@link BearTunesConverterOptions.forceOverwriteOutputFile}
   * is enabled.
   *
   * Existing paths that do not point directly to regular files, including
   * symbolic links, are rejected regardless of the overwrite option.
   *
   * @param outputFilePath - Resolved path to which conversion will write.
   * @throws {ConverterGuardError} When the output path is inaccessible, exists
   * but does not point to a regular file, or an existing file cannot be overwritten.
   */
  private assertOutputFileCanBeCreated(outputFilePath: string): void {
    let outputFileStats: fs.Stats;

    try {
      outputFileStats = fs.lstatSync(outputFilePath);
    } catch (error: unknown) {
      if (isErrorWithStringCode(error) && error.code === 'ENOENT') {
        return;
      }

      throw new ConverterGuardError(
        BearTunesConverterFailureCode.OutputPathAccessError,
        new Error(
          `${this.constructor.name}: Cannot access output path ${outputFilePath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    if (!outputFileStats.isFile()) {
      throw new ConverterGuardError(
        BearTunesConverterFailureCode.InvalidOutputPath,
        new TypeError(
          `${this.constructor.name}: Output path ${outputFilePath} does not point to a regular file`,
        ),
      );
    }

    if (!this.options.forceOverwriteOutputFile) {
      throw new ConverterGuardError(
        BearTunesConverterFailureCode.OutputFileAlreadyExists,
        new Error(
          `${this.constructor.name}: Output file already exists: ${outputFilePath}`,
        ),
      );
    }
  }

  /**
   * Resolves the output file path to use for a conversion operation.
   *
   * If `outputPath` is not provided, the method derives the output file path
   * from `inputFilePath` by replacing the input extension with
   * `outputExtension`.
   *
   * If `outputPath` points to an existing directory or a symbolic link
   * resolving to a directory, the method appends the converted input file name.
   * If it points to an existing regular file, the method validates that the
   * path uses the expected output extension. Symbolic links resolving to files
   * are not accepted as output file paths.
   *
   * If it does not exist, the method treats it as a target file path and
   * verifies that its parent directory exists and is a directory. Symbolic
   * links resolving to directories are accepted as parent directories.
   *
   * This helper acts as a fail-fast guard for output path preconditions.
   * It returns the resolved output file path when resolution succeeds and
   * throws {@link ConverterGuardError} when the output path is inaccessible,
   * invalid, uses an unexpected file extension, or has an invalid parent
   * directory.
   *
   * @param inputFilePath - Source file path used to derive the default output file path and file name.
   * @param outputPath - Optional output file path or output directory path provided by the caller.
   * @param inputExtensionPattern - Pattern matching the source file extension that should be replaced.
   * @param outputExtension - Output file extension to use when deriving the final output path.
   * @param expectedOutputExtensionPattern - Pattern matching valid output file paths for the target format.
   * @returns The resolved output file path.
   * @throws {ConverterGuardError} When the output path is inaccessible, is an
   * unsupported filesystem entry, uses an unexpected file extension, or refers
   * to a target file whose parent directory is inaccessible or not a directory.
   */
  private resolveOutputPath(
    inputFilePath: string,
    outputPath: string | undefined,
    inputExtensionPattern: RegExp,
    outputExtension: string,
    expectedOutputExtensionPattern: RegExp,
  ): string {
    if (outputPath === undefined) {
      return inputFilePath.replace(inputExtensionPattern, outputExtension);
    }

    let outputPathEntryStats: fs.Stats;

    try {
      outputPathEntryStats = fs.lstatSync(outputPath);
    } catch (error: unknown) {
      if (isErrorWithStringCode(error) && error.code === 'ENOENT') {
        if (!outputPath.match(expectedOutputExtensionPattern)) {
          throw new ConverterGuardError(
            BearTunesConverterFailureCode.InvalidOutputFileExtension,
            new TypeError(
              `${this.constructor.name}: Specified output path ${outputPath} does not have ${outputExtension} extension`,
            ),
          );
        }

        const outputDirectoryPath = path.dirname(outputPath);
        let outputDirectoryStats: fs.Stats;

        try {
          outputDirectoryStats = fs.statSync(outputDirectoryPath);
        } catch (directoryError) {
          throw new ConverterGuardError(
            BearTunesConverterFailureCode.OutputPathAccessError,
            new Error(
              `${this.constructor.name}: Cannot access output directory ${outputDirectoryPath}`,
              { cause: normalizeUnknownError(directoryError) },
            ),
          );
        }

        if (!outputDirectoryStats.isDirectory()) {
          throw new ConverterGuardError(
            BearTunesConverterFailureCode.InvalidOutputPath,
            new TypeError(
              `${this.constructor.name}: Output path parent ${outputDirectoryPath} is not a directory`,
            ),
          );
        }

        return outputPath;
      }

      throw new ConverterGuardError(
        BearTunesConverterFailureCode.OutputPathAccessError,
        new Error(
          `${this.constructor.name}: Cannot access output path ${outputPath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    let outputPathStats = outputPathEntryStats;

    if (outputPathEntryStats.isSymbolicLink()) {
      try {
        outputPathStats = fs.statSync(outputPath);
      } catch (error) {
        if (isErrorWithStringCode(error) && error.code === 'ENOENT') {
          throw new ConverterGuardError(
            BearTunesConverterFailureCode.InvalidOutputPath,
            new TypeError(
              `${this.constructor.name}: Output path ${outputPath} is a broken symbolic link`,
              { cause: normalizeUnknownError(error) },
            ),
          );
        }

        throw new ConverterGuardError(
          BearTunesConverterFailureCode.OutputPathAccessError,
          new Error(
            `${this.constructor.name}: Cannot access symbolic link target at ${outputPath}`,
            { cause: normalizeUnknownError(error) },
          ),
        );
      }

      if (!outputPathStats.isDirectory()) {
        throw new ConverterGuardError(
          BearTunesConverterFailureCode.InvalidOutputPath,
          new TypeError(
            `${this.constructor.name}: Output path ${outputPath} is a symbolic link but does not point to a directory`,
          ),
        );
      }
    }

    if (outputPathStats.isDirectory()) {
      const normalizedOutputDirectoryPath = normalizeTrailingPathSeparators(outputPath);
      const outputFilename = path.basename(inputFilePath).replace(
        inputExtensionPattern,
        outputExtension,
      );

      return path.join(normalizedOutputDirectoryPath, outputFilename);
    }

    if (outputPathStats.isFile()) {
      if (outputPath.match(expectedOutputExtensionPattern)) {
        return outputPath;
      }

      throw new ConverterGuardError(
        BearTunesConverterFailureCode.InvalidOutputFileExtension,
        new TypeError(
          `${this.constructor.name}: Specified output path ${outputPath} is a file but does not have ${outputExtension} extension`,
        ),
      );
    }

    throw new ConverterGuardError(
      BearTunesConverterFailureCode.InvalidOutputPath,
      new TypeError(
        `${this.constructor.name}: Specified output path ${outputPath} is neither a file nor directory`,
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
   * Symbolic links supplied as the input file itself are not accepted.
   * Symbolic links in parent directory components are followed by the filesystem.
   *
   * @param inputFilePath - Path to the source file to validate.
   * @param expectedExtensionPattern - Pattern matching the required input file extension.
   * @param expectedExtensionDescription - Human-readable description of accepted input extensions used in error messages.
   * @throws {ConverterGuardError} When the input path is inaccessible, does not
   * point to a file, or does not match the expected extension.
   */
  private assertValidInputFilePath(
    inputFilePath: string,
    expectedExtensionPattern: RegExp,
    expectedExtensionDescription: string,
  ): void {
    let inputFilePathStats: fs.Stats;

    try {
      inputFilePathStats = fs.lstatSync(inputFilePath);
    } catch (error) {
      throw new ConverterGuardError(
        BearTunesConverterFailureCode.InputFileAccessError,
        new Error(
          `${this.constructor.name}: Cannot access input path ${inputFilePath}`,
          { cause: normalizeUnknownError(error) },
        ),
      );
    }

    if (!inputFilePathStats.isFile() || !inputFilePath.match(expectedExtensionPattern)) {
      throw new ConverterGuardError(
        BearTunesConverterFailureCode.InvalidInputFile,
        new TypeError(
          `${this.constructor.name}: Specified path ${inputFilePath} is not a file or does not have ${expectedExtensionDescription} extension`,
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
  private tryDeleteFile(filePath: string, context: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      logger.warn(`${this.constructor.name}: Failed to delete ${context}: ${filePath}`, { error });
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
  private finalizeSuccessfulConversion(
    sourceFilePath: string,
    deleteSourceAfterConversion: boolean,
    outputPath: string,
    encoderStdout?: string,
    encoderStderr?: string,
  ): BearTunesConverterSuccessResult {
    if (deleteSourceAfterConversion) {
      this.tryDeleteFile(sourceFilePath, 'source file');
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
   * The method validates the input file, resolves the output file path, and
   * authorizes writing to that path according to `forceOverwriteOutputFile`.
   * An existing regular output file is rejected unless forced overwrite is
   * enabled. Symbolic links resolving to directories are accepted as output
   * directories or parent directories, while symbolic links used as output
   * file paths are rejected.
   *
   * After the output path is authorized, the method runs the `flac` encoder.
   * The `--force` argument is passed only when `forceOverwriteOutputFile` is
   * enabled, allowing the encoder to replace an authorized existing output file.
   * The encoder outcome is mapped to a converter result. On successful
   * conversion, the source AIFF file may also be deleted when requested.
   *
   * Input file validation and output path resolution are performed internally
   * by fail-fast guard helpers. Symbolic links supplied as the input file itself
   * are not accepted. Any resulting {@link ConverterGuardError} is caught within
   * this method and mapped back to a {@link BearTunesConverterFailureResult},
   * so callers continue to interact with a result-based public API. Any other
   * unexpected preparation error is normalized and mapped to
   * `UnexpectedPreparationError`.
   *
   * Encoder execution is delegated to {@link executeCommandSync}. A
   * {@link CommandExecutionStartError} raised by that helper is mapped to
   * `EncoderProcessStartFailed`, while a {@link CommandExecutionFailedError} is
   * translated into either `EncoderProcessSignaled` or `EncoderProcessFailed`.
   * Captured encoder standard output and standard error are included in these
   * process failure results when available. Any other unexpected execution
   * error is normalized and mapped to
   * `UnexpectedSingleCommandExecutionError`.
   *
   * @param aiffFilePath - Path to the source AIFF file to convert.
   * @param outputPath - Optional existing output directory or target FLAC file
   * path. Symbolic links resolving to directories are accepted when used as
   * output directories or parent directories. An existing target file must be
   * a regular file and may be replaced only when `forceOverwriteOutputFile` is
   * enabled. A nonexistent target file path must have an existing parent directory.
   * @param deleteAiffAfterConversion - Whether to attempt deleting the source
   * AIFF file after successful conversion. Deletion failures are logged as
   * warnings and do not change the conversion result.
   * @returns A converter result describing whether the conversion succeeded or
   * why it failed.
   */
  aiffToFlac(
    aiffFilePath: string,
    outputPath: string | undefined = undefined,
    deleteAiffAfterConversion = false,
  ): BearTunesConverterResult {
    let resolvedOutputPath: string;

    try {
      this.assertValidInputFilePath(
        aiffFilePath,
        /\.(aif|aiff)$/i,
        '*.aif or *.aiff',
      );

      resolvedOutputPath = this.resolveOutputPath(
        aiffFilePath,
        outputPath,
        /\.(aif|aiff)$/i,
        '.flac',
        /\.flac$/i,
      );

      this.assertOutputFileCanBeCreated(resolvedOutputPath);
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
      const flacArguments = [
        '--verify',
        '-8',
        // Pass --force only when output file overwriting is explicitly enabled.
        ...(this.options.forceOverwriteOutputFile ? ['--force'] : []),
        '--output-name',
        resolvedOutputPath,
        aiffFilePath,
      ];

      const commandResult = executeCommandSync('flac', flacArguments);

      return this.finalizeSuccessfulConversion(
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
   * Converts a FLAC file to an MP3 file, optionally preparing and transferring
   * tag metadata.
   *
   * The method validates the input file, resolves the output file path, and
   * authorizes writing to that path according to `forceOverwriteOutputFile`.
   * An existing regular output file is rejected unless forced overwrite is
   * enabled. Symbolic links resolving to directories are accepted as output
   * directories or parent directories, while symbolic links used as output
   * file paths are rejected.
   *
   * After the output path is authorized, the method builds the LAME encoder
   * arguments and optionally prepares tag transfer arguments before running
   * a `flac` to `lame` conversion pipeline. The LAME encoder writes the output
   * directly to the resolved path. An existing regular output file is accepted
   * for replacement only when `forceOverwriteOutputFile` is enabled. The pipeline
   * outcome is mapped to a converter result. On successful conversion, the source
   * FLAC file may also be deleted when requested. Temporary files returned by
   * successful tag-transfer preparation are passed to cleanup after pipeline
   * execution. Cleanup failures are logged as warnings and do not change the
   * conversion result.
   *
   * Input file validation and output path resolution are performed internally
   * by fail-fast guard helpers. Symbolic links supplied as the input file itself
   * are not accepted. Any resulting {@link ConverterGuardError} is caught within
   * this method and mapped back to a {@link BearTunesConverterFailureResult},
   * so callers continue to interact with a result-based public API. Any other
   * unexpected preparation error is normalized and mapped to
   * `UnexpectedPreparationError`.
   *
   * Tag transfer preparation failures are mapped to `TagTransferPreparationFailed`.
   *
   * Pipeline execution is delegated to {@link executeCommandPipeline}. A
   * {@link CommandPipelineInfrastructureError} raised by that helper is mapped
   * to `ConversionPipelineInfrastructureFailed`, while command-specific
   * non-zero exits are mapped to `FlacDecodeProcessFailed` or
   * `LameEncodeProcessFailed`. Any other unexpected pipeline execution error is
   * normalized and mapped to `UnexpectedPipelineExecutionError`.
   *
   * @param flacFilePath - Path to the source FLAC file to convert.
   * @param outputPath - Optional existing output directory or target MP3 file
   * path. Symbolic links resolving to directories are accepted when used as
   * output directories or parent directories. An existing target file must be
   * a regular file and may be replaced only when `forceOverwriteOutputFile` is
   * enabled. A nonexistent target file path must have an existing parent directory.
   * @param deleteFlacAfterConversion - Whether to attempt deleting the source
   * FLAC file after successful conversion. Deletion failures are logged as
   * warnings and do not change the conversion result.
   * @returns A promise resolved with a converter result describing whether the
   * conversion succeeded or why it failed.
   */
  async flacToMp3(
    flacFilePath: string,
    outputPath: string | undefined = undefined,
    deleteFlacAfterConversion = false,
  ): Promise<BearTunesConverterResult> {
    let resolvedOutputPath: string;
    let lameArguments: string[];

    try {
      this.assertValidInputFilePath(
        flacFilePath,
        /\.flac$/i,
        '*.flac',
      );

      resolvedOutputPath = this.resolveOutputPath(
        flacFilePath,
        outputPath,
        /\.flac$/i,
        '.mp3',
        /\.mp3$/i,
      );

      this.assertOutputFileCanBeCreated(resolvedOutputPath);

      lameArguments = this.buildLameArguments();

      if (this.options.verbose) {
        logger.info(`Using LAME options: ${lameArguments.join(' ')}`);
      }
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

      return this.finalizeSuccessfulConversion(
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
        this.tryDeleteFile(filePath, 'temporary tag transfer file');
      });
    }
  }
}
