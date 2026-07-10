/**
 * Error codes classifying converter failures.
 */
export enum BearTunesConverterFailureCode {
  // 100-109: input / output validation

  /** The input path does not point to a supported input file. */
  InvalidInputFile = 101,

  /** The input file could not be accessed. */
  InputFileAccessError = 102,

  /** The provided output file path does not use the expected extension. */
  InvalidOutputFileExtension = 103,

  /** The provided output path is neither a valid file path nor a directory path. */
  InvalidOutputPath = 104,

  /** The output path could not be accessed. */
  OutputPathAccessError = 105,

  /** The resolved output file path already exists. */
  OutputFileAlreadyExists = 106,

  // 110-119: conversion preparation

  /** An unexpected error occurred while preparing conversion prerequisites. */
  UnexpectedPreparationError = 111,

  /** Preparing MP3 tag transfer metadata failed. */
  TagTransferPreparationFailed = 112,

  // 120-129: single-process encoder execution

  /** The encoder process could not be started. */
  EncoderProcessStartFailed = 121,

  /** The encoder process was terminated by a signal. */
  EncoderProcessSignaled = 122,

  /** The encoder process failed or exited with a non-zero status code. */
  EncoderProcessFailed = 123,

  /** An unexpected error occurred while executing a single encoder process. */
  UnexpectedSingleCommandExecutionError = 124,

  // 130-139: multi-process pipeline execution

  /** The conversion pipeline failed due to infrastructure issues. */
  ConversionPipelineInfrastructureFailed = 131,

  /** The FLAC decoder process failed. */
  FlacDecodeProcessFailed = 132,

  /** The LAME encoder process failed. */
  LameEncodeProcessFailed = 133,

  /** An unexpected error occurred while executing the conversion pipeline. */
  UnexpectedPipelineExecutionError = 134,
}

/**
 * Fields shared by all converter results, regardless of success or failure.
 */
export interface BearTunesConverterResultBase {
  /** Standard output captured from the encoder process, when available. */
  encoderStdout?: string;

  /** Standard error output captured from the encoder process, when available. */
  encoderStderr?: string;
}

/**
 * Result returned when a conversion completes successfully.
 */
export interface BearTunesConverterSuccessResult extends BearTunesConverterResultBase {
  /** Discriminator indicating that the conversion succeeded. */
  ok: true;

  /** Resolved path of the successfully produced output file. */
  outputPath: string;
}

/**
 * Result returned when a conversion fails.
 */
export interface BearTunesConverterFailureResult extends BearTunesConverterResultBase {
  /** Discriminator indicating that the conversion failed. */
  ok: false;

  /** Domain-specific code classifying the conversion failure. */
  failureCode: BearTunesConverterFailureCode;

  /** Error object describing the failure cause. */
  error: Error;
}

/**
 * Discriminated union describing the outcome of a converter operation.
 *
 * When `ok` is `true`, the result is a {@link BearTunesConverterSuccessResult}
 * and contains the resolved `outputPath`.
 *
 * When `ok` is `false`, the result is a {@link BearTunesConverterFailureResult}
 * and contains `failureCode` together with the underlying `error`.
 */
export type BearTunesConverterResult =
  | BearTunesConverterSuccessResult
  | BearTunesConverterFailureResult;

/**
 * Configuration options controlling BearTunes audio conversion.
 */
export interface BearTunesConverterOptions {
  /** Bitrate control mode used for MP3 encoding. */
  mp3BitrateMode: Mp3BitrateMode;

  /** Bitrate value used by CBR and ABR modes, in kbps. */
  mp3BitrateKbps: number;

  /** Minimum bitrate value used by VBR mode, in kbps. */
  mp3VbrMinBitrateKbps: number;

  /** Maximum bitrate value used by VBR mode, in kbps. */
  mp3VbrMaxBitrateKbps: number;

  /** LAME MP3 encoder algorithm quality setting passed via the `-q` switch. */
  lameQuality: LameQuality;

  /** MP3 channel mode passed to the LAME encoder. */
  mp3ChannelMode: Mp3ChannelMode;

  /** ReplayGain mode passed to the LAME encoder. */
  replayGainMode: ReplayGainMode;

  /** Whether metadata should be transferred from the source file. */
  transferTagEntries: boolean;

  /** Whether verbose logging is enabled. */
  verbose: boolean;
}

/**
 * Bitrate control modes supported by the LAME MP3 encoder.
 */
export enum Mp3BitrateMode {
  /** Uses constant bitrate encoding. */
  CBR = '--cbr',

  /** Uses variable bitrate encoding. */
  VBR = '--vbr-new',

  /** Uses average bitrate encoding. */
  ABR = '--abr',
}

/**
 * LAME `-q` algorithm quality settings supported by the encoder.
 *
 * @see {@link https://lame.sourceforge.io/using.php | Official LAME documentation}
 * @see {@link https://wiki.hydrogenaudio.org/index.php?title=LAME_-q_switch | Hydrogenaudio: LAME -q switch}
 */
export enum LameQuality {
  /** Uses LAME quality setting `-q0` (slowest). */
  Q0 = '-q0',

  /** Uses LAME quality setting `-q1`. */
  Q1 = '-q1',

  /** Uses LAME quality setting `-q2`. */
  Q2 = '-q2',

  /** Uses LAME quality setting `-q3`. */
  Q3 = '-q3',

  /** Uses LAME quality setting `-q4`. */
  Q4 = '-q4',

  /** Uses LAME quality setting `-q5`. */
  Q5 = '-q5',

  /** Uses LAME quality setting `-q6`. */
  Q6 = '-q6',

  /** Uses LAME quality setting `-q7`. */
  Q7 = '-q7',

  /** Uses LAME quality setting `-q8`. */
  Q8 = '-q8',

  /** Uses LAME quality setting `-q9` (fastest). */
  Q9 = '-q9',
}

/**
 * Stereo channel modes supported by the LAME MP3 encoder.
 */
export enum Mp3ChannelMode {
  /** Uses joint stereo output. */
  JointStereo = 'j',

  /** Uses stereo output. */
  Stereo = 's',

  /** Uses mono output. */
  Mono = 'm',
}

/**
 * ReplayGain modes supported by the LAME MP3 encoder.
 */
export enum ReplayGainMode {
  /** Calculates ReplayGain using the accurate mode. */
  Accurate = '--replaygain-accurate',

  /** Calculates ReplayGain using the fast mode. */
  Fast = '--replaygain-fast',

  /** Disables ReplayGain processing. */
  None = '--noreplaygain',
}
