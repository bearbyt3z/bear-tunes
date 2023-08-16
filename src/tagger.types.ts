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

// Beatport search result object

export enum BeatportSearchResultArtistType {
  Artist = 'Artist',
  Remixer = 'Remixer',
}

export interface BeatportSearchResultArtistInfo {
  artist_id: number,
  artist_name: string,
  artist_type_name: BeatportSearchResultArtistType,
}

export interface BeatportSearchResultLabelInfo {
  label_id: number,
  label_name: string,
}

export interface BeatportSearchResultReleaseInfo {
  release_id: number,
  release_name: string,
  release_image_url: string,
}

export interface BeatportSearchResultGenreInfo {
  genre_id: string, // it's a number but as a string
  genre_name: string,
}

export interface BeatportSearchResultTrackInfo {
  score: number,
  artists: BeatportSearchResultArtistInfo[],
  bpm: number,
  catalog_number: string,
  isrc: string,
  key_id: number,
  key_name: string,
  label: BeatportSearchResultLabelInfo,
  length: number, // in miliseconds
  mix_name: string, // e.g.: Extended Mix / Original Mix / ... Remix
  release: BeatportSearchResultReleaseInfo,
  release_date: string,
  track_id: number,
  track_name: string,
  track_number: number,
  track_image_uri: string,
  genre: BeatportSearchResultGenreInfo[],
}

// Beatport detailed track info object

export interface BeatportArtistInfo {
  id: number,
  name: string,
}

export interface BeatportGenreInfo {
  id: number,
  name: string,
}

export interface BeatportImageInfo {
  id: number,
  uri: string,
}

export interface BeatportLabelInfo {
  id: number,
  name: string,
  image: BeatportImageInfo,
  slug: string,
}

export interface BeatportKeyInfo {
  // camelot_number: number,
  // camelot_letter: string,
  id: number,
  name: string,
}

export interface BeatportReleaseInfo {
  id: number,
  name: string,
  image: BeatportImageInfo,
  label: BeatportLabelInfo,
  slug: string,
}

export interface BeatportTrackInfo {
  artists: BeatportArtistInfo[],
  bpm: number,
  catalog_number: string,
  genre: BeatportGenreInfo,
  id: number,
  image: BeatportImageInfo,
  isrc: string,
  key: BeatportKeyInfo,
  length: string, // minutes:seconds
  length_ms: number, // in miliseconds
  mix_name: string, // e.g.: Extended Mix / Original Mix / ... Remix
  name: string,
  new_release_date: string,
  number: number, // album track number
  // publish_date: string,
  release: BeatportReleaseInfo,
  remixers: BeatportArtistInfo[],
  slug: string,
  sub_genre: string | null,
}

// Beatport album (release) info object

export interface BeatportAlbumInfo {
  artists: BeatportArtistInfo[],
  bpm_range: { min: number, max: number },
  catalog_number: string,
  id: number,
  image: BeatportImageInfo,
  label: BeatportLabelInfo,
  name: string,
  new_release_date: string,
  // publish_date: string,
  remixers: BeatportArtistInfo[],
  slug: string,
  tracks: string[], // URLs of all release tracks
  track_count: number,
}

// Beatport publisher (label) info object

export interface BeatportPublisherInfo {
  id: number,
  image: BeatportImageInfo,
  name: string,
  // latest_active_publish_date: string,
  slug: string,
}
