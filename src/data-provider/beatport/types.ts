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
 * Validated Beatport album payload together with its resolved source URL.
 */
export interface BeatportAlbumPayloadResult {
  /**
   * URL from which the album payload was fetched.
   */
  albumUrl: URL;

  /**
   * Validated album metadata returned by Beatport.
   */
  albumData: BeatportAlbumInfo;
}

/**
 * Validated Beatport publisher payload together with its resolved source URL.
 */
export interface BeatportPublisherPayloadResult {
  /**
   * URL from which the publisher payload was fetched.
   */
  publisherUrl: URL;

  /**
   * Validated publisher metadata returned by Beatport.
   */
  publisherData: BeatportPublisherInfo;
}

/**
 * Artist roles exposed by Beatport artist metadata.
 *
 * The enum values match the role names returned by the Beatport API.
 */
export enum BeatportArtistType {
  /**
   * Primary artist credited on the track or release.
   */
  Artist = 'Artist',

  /**
   * Artist credited as a remixer.
   */
  Remixer = 'Remixer',

  /**
   * Remixer associated with Beatsource.
   */
  Beatsource_Remixer = 'Beatsource Remixer',

  /**
   * Producer credited by Beatport.
   *
   * This value is accepted for API compatibility but is currently not used
   * when mapping track metadata for tagging.
   */
  Producer = 'Producer',

  /**
   * DJ credited by Beatport.
   *
   * This value is accepted for API compatibility but is currently not used
   * when mapping track metadata for tagging.
   */
  DJ = 'DJ',
}

// Beatport search result object

/**
 * Artist information returned in a Beatport search result.
 */
export interface BeatportSearchResultArtistInfo {
  /**
   * Beatport artist identifier.
   */
  artist_id: number;

  /**
   * Artist name returned by Beatport.
   */
  artist_name: string;

  /**
   * Artist role returned by Beatport.
   */
  artist_type_name: BeatportArtistType;
}

/**
 * Label information returned in a Beatport search result.
 */
export interface BeatportSearchResultLabelInfo {
  /**
   * Beatport label identifier.
   */
  label_id: number;

  /**
   * Label name returned by Beatport.
   */
  label_name: string;
}

/**
 * Release information returned in a Beatport search result.
 */
export interface BeatportSearchResultReleaseInfo {
  /**
   * Beatport release identifier.
   */
  release_id: number;

  /**
   * Release name returned by Beatport.
   */
  release_name: string;

  /**
   * Optional release artwork URL returned by Beatport.
   */
  release_image_url?: string;
}

/**
 * Genre information returned in a Beatport search result.
 */
export interface BeatportSearchResultGenreInfo {
  /**
   * Beatport genre identifier.
   */
  genre_id: number;

  /**
   * Genre name returned by Beatport.
   */
  genre_name: string;
}

/**
 * Track information returned in a Beatport search result.
 */
export interface BeatportSearchResultTrackInfo {
  /**
   * Search relevance score assigned by Beatport.
   */
  score: number;

  /**
   * Artists associated with the search result.
   */
  artists: BeatportSearchResultArtistInfo[];

  /**
   * Optional track tempo in beats per minute.
   */
  bpm?: number;

  /**
   * Optional release catalog number.
   */
  catalog_number?: string;

  /**
   * Optional ISRC. Beatport may return `null` when it is unavailable.
   */
  isrc?: string | null;

  /**
   * Optional Beatport key identifier.
   */
  key_id?: number;

  /**
   * Optional musical key name.
   */
  key_name?: string;

  /**
   * Label associated with the track.
   */
  label: BeatportSearchResultLabelInfo;

  /**
   * Track length in milliseconds, when returned by Beatport.
   */
  length?: number;

  /**
   * Mix name, such as `Extended Mix`, `Original Mix`, or a remix name.
   */
  mix_name: string;

  /**
   * Release containing the track.
   */
  release: BeatportSearchResultReleaseInfo;

  /**
   * Release date returned by Beatport.
   */
  release_date: string;

  /**
   * Beatport track identifier.
   */
  track_id: number;

  /**
   * Track title returned by Beatport.
   */
  track_name: string;

  /**
   * Track position within the release.
   */
  track_number: number;

  /**
   * Optional track artwork URL returned by Beatport.
   */
  track_image_uri?: string;

  /**
   * Genres associated with the track.
   */
  genre: BeatportSearchResultGenreInfo[];
}

// Beatport detailed track info object

/**
 * Artist information returned by detailed Beatport album and release payloads.
 *
 * Artist roles are implied by the containing `artists` or `remixers` array.
 */
export interface BeatportArtistInfo {
  /**
   * Beatport artist identifier.
   */
  id: number;

  /**
   * Artist name returned by Beatport.
   */
  name: string;
}

/**
 * Artist information returned in a detailed Beatport track payload.
 *
 * The artist role is explicitly provided by the `type` field.
 */
export interface BeatportArtistWithRoleInfo extends BeatportArtistInfo {
  /**
   * Role assigned to the artist by Beatport.
   */
  type: BeatportArtistType;
}

/**
 * Genre information returned in a detailed Beatport track payload.
 */
export interface BeatportGenreInfo {
  /**
   * Beatport genre identifier.
   */
  id: number;

  /**
   * Genre name returned by Beatport.
   */
  name: string;

  /**
   * Subgenre associated with the genre, or `null` when no subgenre is available.
   */
  sub_genre: BeatportSubGenreInfo | null;
}

/**
 * Subgenre information returned in a detailed Beatport track payload.
 */
export interface BeatportSubGenreInfo {
  /**
   * Beatport subgenre identifier, or `null` when unavailable.
   */
  id: number | null;

  /**
   * Subgenre name, or `null` when unavailable.
   */
  name: string | null;
}

/**
 * Image information returned by Beatport.
 */
export interface BeatportImageInfo {
  /**
   * Beatport image identifier.
   */
  id: number;

  /**
   * Image resource URI returned by Beatport.
   */
  uri: string;
}

/**
 * Label information returned in a detailed Beatport payload.
 */
export interface BeatportLabelInfo {
  /**
   * Beatport label identifier.
   */
  id: number;

  /**
   * Label name returned by Beatport.
   */
  name: string;

  /**
   * URL slug used to build the Beatport label URL.
   */
  slug: string;
}

/**
 * Release information returned in a detailed Beatport track payload.
 */
export interface BeatportReleaseInfo {
  /**
   * Beatport release identifier.
   */
  id: number;

  /**
   * Release name returned by Beatport.
   */
  name: string;

  /**
   * Release artwork URL returned by Beatport.
   */
  image_url: string;

  /**
   * Release date returned by Beatport.
   */
  release_date: string;

  /**
   * URL slug used to build the Beatport release URL.
   */
  slug: string;
}

/**
 * Detailed track information returned by Beatport.
 */
export interface BeatportTrackInfo {
  /**
   * Artists associated with the track, including their Beatport roles.
   */
  artists: BeatportArtistWithRoleInfo[];

  /**
   * Optional track tempo in beats per minute.
   */
  bpm?: number;

  /**
   * Optional release catalog number.
   */
  catalog_number?: string;

  /**
   * Primary genre and optional subgenre associated with the track.
   */
  genre: BeatportGenreInfo;

  /**
   * Beatport track identifier.
   */
  track_id: number;

  /**
   * Track waveform URL returned by Beatport.
   */
  track_waveform_url: string;

  /**
   * Optional ISRC. Beatport may return `null` when it is unavailable.
   */
  isrc?: string | null;

  /**
   * Musical key returned by Beatport.
   */
  key: string;

  /**
   * Track duration in milliseconds.
   */
  track_length_ms: number;

  /**
   * Mix name, such as `Extended Mix`, `Original Mix`, or a remix name.
   */
  mix_name: string;

  /**
   * Track title returned by Beatport.
   */
  track_name: string;

  /**
   * Track position within the release.
   */
  track_number: string; // album track number

  /**
   * Release containing the track.
   */
  release: BeatportReleaseInfo;

  /**
   * Label associated with the track.
   */
  label: BeatportLabelInfo;
}

/**
 * Detailed album or release information returned by Beatport.
 */
export interface BeatportAlbumInfo {
  /**
   * Artists associated with the release.
   */
  artists: BeatportArtistInfo[];

  /**
   * Minimum and maximum BPM values reported for the release.
   */
  bpm_range: {
    min: number;
    max: number;
  };

  /**
   * Optional release catalog number.
   */
  catalog_number?: string;

  /**
   * Beatport release identifier.
   */
  id: number;

  /**
   * Release artwork metadata.
   */
  image: BeatportImageInfo;

  /**
   * Label associated with the release.
   */
  label: BeatportLabelInfo;

  /**
   * Release name returned by Beatport.
   */
  name: string;

  /**
   * New release date returned by Beatport.
   */
  new_release_date: string;

  /**
   * Artists credited as remixers on the release.
   */
  remixers: BeatportArtistInfo[];

  /**
   * URL slug used to build the Beatport release URL.
   */
  slug: string;

  /**
   * URLs of all tracks included in the release.
   */
  tracks: string[];

  /**
   * Number of tracks included in the release.
   */
  track_count: number;
}

/**
 * Detailed publisher or label information returned by Beatport.
 */
export interface BeatportPublisherInfo {
  /**
   * Beatport label identifier.
   */
  id: number;

  /**
   * Label artwork metadata.
   */
  image: BeatportImageInfo;

  /**
   * Label name returned by Beatport.
   */
  name: string;

  /**
   * URL slug used to build the Beatport label URL.
   */
  slug: string;
}
