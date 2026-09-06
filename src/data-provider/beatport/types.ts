/**
 * Configuration used by BeatportDataProvider to access Beatport metadata.
 */
export interface BeatportDataProviderOptions {
  /**
   * Base Beatport URL used to build track, release, label, and search URLs.
   */
  domainUrl: string;

  /**
   * Beatport path used for track searches.
   */
  trackSearchPath: string;

  /**
   * Query parameter name used to send track search keywords.
   */
  trackSearchQueryParameter: string;

  /**
   * Static query parameters applied to every track search.
   */
  trackSearchParameters: Readonly<Record<string, string>>;
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

export enum BeatportArtistType {
  Artist = 'Artist',
  Remixer = 'Remixer',
  Beatsource_Remixer = 'Beatsource Remixer',
  Producer = 'Producer', // accepted for API compatibility; currently not used in track tagging
  DJ = 'DJ', // accepted for API compatibility; currently not used in track tagging
}

export interface BeatportSearchResultArtistInfo {
  artist_id: number;
  artist_name: string;
  artist_type_name: BeatportArtistType;
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
  length?: number; // in milliseconds
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

/**
 * Minimal artist information returned by Beatport album payloads.
 *
 * Artist role is implied by the containing `artists` or `remixers` array.
 */
export interface BeatportArtistInfo {
  id: number;
  name: string;
}

/**
 * Artist information returned in a detailed Beatport track payload.
 *
 * The role is explicitly provided by the `type` field.
 */
export interface BeatportArtistWithRoleInfo extends BeatportArtistInfo {
  type: BeatportArtistType;
}

export interface BeatportGenreInfo {
  id: number;
  name: string;
  sub_genre: BeatportSubGenreInfo | null;
}

export interface BeatportSubGenreInfo {
  id: number | null;
  name: string | null;
}

export interface BeatportImageInfo {
  id: number;
  uri: string;
}

export interface BeatportLabelInfo {
  id: number;
  name: string;
  slug: string;
}

export interface BeatportReleaseInfo {
  id: number;
  name: string;
  image_url: string;
  release_date: string;
  slug: string;
}

export interface BeatportTrackInfo {
  artists: BeatportArtistWithRoleInfo[];
  bpm?: number;
  catalog_number?: string;
  genre: BeatportGenreInfo;
  track_id: number;
  track_waveform_url: string;
  isrc?: string | null;
  key: string;
  track_length_ms: number; // in milliseconds
  mix_name: string; // e.g.: Extended Mix / Original Mix / ... Remix
  track_name: string;
  track_number: string; // album track number
  release: BeatportReleaseInfo;
  label: BeatportLabelInfo;
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
