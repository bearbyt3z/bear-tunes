import { TrackInfo } from './types';

export interface BearTunesTaggerOptions {
  domainURL: string,
  searchURL: string, // TODO: URL
  eyeD3DisplayPluginPatternFile: string,
  verbose: boolean,
}

export interface MatchingTrack extends TrackInfo {
  score: number,
  scoreKeywords: string[],
  fullName: string,
}

export interface TrackArtworkFiles {
  frontCover?: string, // TODO: File?
  waveform?: string,
  publisherLogotype?: string,
}

export enum ID3Version {
  ID3v1_0 = '1.0',
  ID3v1_1 = '1.1',
  ID3v2_3 = '2.3',
  ID3v2_4 = '2.4',
}
