/**
 * Status codes describing the outcome of a converter operation.
 */
export enum BearTunesConverterStatus {
  Success = 0,
  InvalidInputFile = 101,
  InputFileAccessError = 102,
  InvalidOutputFileExtension = 103,
  InvalidOutputPath = 104,
  OutputPathAccessError = 105,
  ConversionFailed = 106,
}

/**
 * Result returned by a BearTunes converter operation.
 *
 * @property status - Final status of the conversion attempt.
 * @property error - Error describing why the operation failed.
 * @property encoderStdout - Standard output captured from the encoder process.
 * @property encoderStderr - Standard error output captured from the encoder process.
 * @property outputPath - Resolved output file path.
 */
export interface BearTunesConverterResult {
  status: BearTunesConverterStatus;
  error: Error | undefined;
  encoderStdout: string | undefined;
  encoderStderr: string | undefined;
  outputPath: string | undefined;
}

/**
 * Configuration options controlling BearTunes audio conversion.
 *
 * @property bitrateMethod - Bitrate control mode used for MP3 encoding.
 * @property bitrateValue - Bitrate value used by CBR and ABR modes.
 * @property bitrateValueMinimum - Minimum bitrate value used by VBR mode.
 * @property bitrateValueMaximum - Maximum bitrate value used by VBR mode.
 * @property quality - Encoder quality preset.
 * @property channelMode - Output channel mode.
 * @property replayGain - ReplayGain mode passed to the encoder.
 * @property transferTagEntries - Whether metadata should be transferred from the source file.
 * @property verbose - Whether verbose logging is enabled.
 */
export interface BearTunesConverterOptions {
  bitrateMethod: BitrateMethod;
  bitrateValue: number; // for CBR & ABR
  bitrateValueMinimum: number; // for VBR
  bitrateValueMaximum: number; // for VBR
  quality: Quality;
  channelMode: ChannelMode;
  replayGain: ReplayGain;
  transferTagEntries: boolean;
  verbose: boolean;
}

/**
 * Bitrate control modes supported by the MP3 encoder.
 */
export enum BitrateMethod {
  CBR = '--cbr',
  VBR = '--vbr-new',
  ABR = '--abr',
}

/**
 * Encoder quality presets supported by LAME.
 */
export enum Quality {
  Q0 = '-q0',
  Q1 = '-q1',
  Q2 = '-q2',
  Q3 = '-q3',
  Q4 = '-q4',
  Q5 = '-q5',
  Q6 = '-q6',
  Q7 = '-q7',
  Q8 = '-q8',
  Q9 = '-q9',
}

/**
 * Stereo channel modes supported by the encoder.
 */
export enum ChannelMode {
  JointStereo = 'j',
  Stereo = 's',
  Mono = 'm',
}

/**
 * ReplayGain modes supported by the encoder.
 */
export enum ReplayGain {
  Accurate = '--replaygain-accurate',
  Fast = '--replaygain-fast',
  None = '--noreplaygain',
}
