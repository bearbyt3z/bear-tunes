import { TrackInfo } from './types';

export interface TaggerOptions {
  searchURL?: string, // TODO: URL
  domainURL?: string,
  eyed3DisplayPluginPatternFile?: string,
  verbose?: boolean,
}

export interface MatchingTrack extends TrackInfo {
  score?: number,
  scoreKeywords?: Array<string>,
  fullName?: string,
}

export interface TrackArtworkFiles {
  frontCover?: string, // TODO: File?
  waveform?: string,
  publisherLogotype?: string,
}
