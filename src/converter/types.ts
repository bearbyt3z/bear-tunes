export interface BearTunesConverterResult {
  status: number | null,
  error: Error | undefined,
  lameStdout: string | undefined,
  lameStderr: string | undefined,
  outputPath: string | undefined,
}

export interface BearTunesConverterOptions {
  bitrateMethod: BitrateMethod,
  bitrateValue: number, // for CBR & ABR
  bitrateValueMinimum: number, // for VBR
  bitrateValueMaximum: number, // for VBR
  quality: Quality,
  channelMode: ChannelMode,
  replayGain: ReplayGain,
  transferTagEntries: boolean,
  verbose: boolean,
}

export enum BitrateMethod {
  CBR = '--cbr',
  VBR = '--vbr-new',
  ABR = '--abr',
}

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

export enum ChannelMode {
  JointStereo = 'j',
  Stereo = 's',
  Mono = 'm',
}

export enum ReplayGain {
  Accurate = '--replaygain-accurate',
  Fast = '--replaygain-fast',
  None = '--noreplaygain',
}
