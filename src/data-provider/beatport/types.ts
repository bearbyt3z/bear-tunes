/**
 * Configuration used by BeatportDataProvider to access Beatport metadata.
 */
export interface BeatportDataProviderOptions {
  /**
   * Base Beatport URL used to build track, release, label, and search URLs.
   */
  domainURL: string;

  /**
   * Beatport path and static query parameters used for track searches.
   */
  trackSearchPath: string;
}

/**
 * Raw Beatport album payload together with its resolved source URL.
 */
export interface BeatportAlbumPayloadResult {
  albumUrl: URL;
  albumData: BeatportAlbumInfo;
}

/**
 * Raw Beatport publisher payload together with its resolved source URL.
 */
export interface BeatportPublisherPayloadResult {
  publisherUrl: URL;
  publisherData: BeatportPublisherInfo;
}

// Beatport search result object

export enum BeatportSearchResultArtistType {
  Artist = 'Artist',
  Remixer = 'Remixer',
  Beatsource_Remixer = 'Beatsource Remixer',
  Producer = 'Producer', // accepted for API compatibility; currently not used in track tagging
  DJ = 'DJ', // accepted for API compatibility; currently not used in track tagging
}

export interface BeatportSearchResultArtistInfo {
  artist_id: number;
  artist_name: string;
  artist_type_name: BeatportSearchResultArtistType;
}

export interface BeatportSearchResultLabelInfo {
  label_id: number;
  label_name: string;
}

export interface BeatportSearchResultReleaseInfo {
  release_id: number;
  release_name: string;
  release_image_url?: string;
}

export interface BeatportSearchResultGenreInfo {
  genre_id: number;
  genre_name: string;
}

export interface BeatportSearchResultTrackInfo {
  score: number;
  artists: BeatportSearchResultArtistInfo[];
  bpm?: number;
  catalog_number?: string;
  isrc?: string | null;
  key_id?: number;
  key_name?: string;
  label: BeatportSearchResultLabelInfo;
  length?: number; // in miliseconds
  mix_name: string; // e.g.: Extended Mix / Original Mix / ... Remix
  release: BeatportSearchResultReleaseInfo;
  release_date: string;
  track_id: number;
  track_name: string;
  track_number: number;
  track_image_uri?: string;
  genre: BeatportSearchResultGenreInfo[];
}

// Beatport detailed track info object

export interface BeatportArtistInfo {
  id: number;
  name: string;
}

export interface BeatportGenreInfo {
  id: number;
  name: string;
}

export interface BeatportSubGenreInfo {
  id: number;
  name: string;
}

export interface BeatportImageInfo {
  id: number;
  uri: string;
}

export interface BeatportLabelInfo {
  id: number;
  name: string;
  image: BeatportImageInfo;
  slug: string;
}

export interface BeatportKeyInfo {
  // camelot_number: number;
  // camelot_letter: string;
  id: number;
  name: string;
}

export interface BeatportReleaseInfo {
  id: number;
  name: string;
  image: BeatportImageInfo;
  label: BeatportLabelInfo;
  slug: string;
}

export interface BeatportTrackInfo {
  artists: BeatportArtistInfo[];
  bpm?: number;
  catalog_number?: string;
  genre: BeatportGenreInfo;
  id: number;
  image: BeatportImageInfo;
  isrc?: string | null;
  key: BeatportKeyInfo;
  length: string; // minutes:seconds
  length_ms: number; // in miliseconds
  mix_name: string; // e.g.: Extended Mix / Original Mix / ... Remix
  name: string;
  new_release_date: string;
  number: number; // album track number
  // publish_date: string;
  release: BeatportReleaseInfo;
  remixers: BeatportArtistInfo[];
  slug: string;
  sub_genre: BeatportSubGenreInfo | null;
}

// Beatport album (release) info object

export interface BeatportAlbumInfo {
  artists: BeatportArtistInfo[];
  bpm_range: { min: number; max: number };
  catalog_number?: string;
  id: number;
  image: BeatportImageInfo;
  label: BeatportLabelInfo;
  name: string;
  new_release_date: string;
  // publish_date: string;
  remixers: BeatportArtistInfo[];
  slug: string;
  tracks: string[]; // URLs of all release tracks
  track_count: number;
}

// Beatport publisher (label) info object

export interface BeatportPublisherInfo {
  id: number;
  image: BeatportImageInfo;
  name: string;
  // latest_active_publish_date: string;
  slug: string;
}
