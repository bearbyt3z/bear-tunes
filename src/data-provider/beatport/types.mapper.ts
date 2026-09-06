import {
  BeatportArtistType,
} from './types.js';

import {
  normalizeTrackTitle,
} from '#normalizer';

import {
  normalizeAlbumInfo,
  normalizePublisherInfo,
  normalizeTrackInfo,
} from '#shared-types-normalizer';

import {
  slugify,
  tryParsePositiveInteger,
} from '#tools';

import type {
  BeatportAlbumInfo,
  BeatportPublisherInfo,
  BeatportSearchResultTrackInfo,
  BeatportTrackInfo,
} from './types.js';

import type {
  AlbumInfo,
  PublisherInfo,
  TrackInfo,
} from '#shared-types';

/**
 * Maps a Beatport search-result track entry to canonical `TrackInfo`.
 *
 * This function performs source-specific field mapping and delegates final
 * canonical value normalization to `normalizeTrackInfo()`. It does not log and
 * does not validate the resulting output schema.
 *
 * @param trackEntry - Beatport search result track object.
 * @param domainUrl - Beatport domain URL used to build the canonical track URL.
 * @returns Canonical `TrackInfo`, or `undefined` when the mapped value cannot be normalized.
 */
export function mapBeatportSearchResultTrackToTrackInfo(
  trackEntry: BeatportSearchResultTrackInfo,
  domainUrl: string,
): TrackInfo | undefined {
  const artists = trackEntry.artists
    .filter((artist) => artist.artist_type_name === BeatportArtistType.Artist)
    .map((artist) => artist.artist_name);

  const remixers = trackEntry.artists
    .filter((artist) =>
      [
        BeatportArtistType.Remixer,
        BeatportArtistType.Beatsource_Remixer,
      ].includes(artist.artist_type_name),
    )
    .map((artist) => artist.artist_name);

  const [genre, subgenre] = trackEntry.genre.map((genreEntry) => genreEntry.genre_name);

  const details = (trackEntry.length === undefined) ? undefined : { duration: trackEntry.length / 1000 };

  return normalizeTrackInfo({
    url: `${domainUrl}/track/${slugify(trackEntry.track_name)}/${trackEntry.track_id}`,
    artists,
    title: normalizeTrackTitle(
      trackEntry.track_name,
      trackEntry.mix_name,
    ),
    remixers,
    released: trackEntry.release_date,
    bpm: trackEntry.bpm,
    isrc: trackEntry.isrc,
    genre,
    subgenre,
    details,
  });
}

/**
 * Maps a Beatport album payload to canonical `AlbumInfo`.
 *
 * This function performs source-specific field mapping and delegates final
 * canonical value normalization to `normalizeAlbumInfo()`. It does not log and
 * does not validate the resulting output schema.
 *
 * @param albumData - Beatport album object.
 * @param albumUrl - Canonical Beatport album URL.
 * @param trackNumber - Track number within the album.
 * @returns Canonical `AlbumInfo`, or `undefined` when the mapped value cannot be normalized.
 */
export function mapBeatportAlbumToAlbumInfo(
  albumData: BeatportAlbumInfo,
  albumUrl: URL,
  trackNumber: string,
): AlbumInfo | undefined {
  return normalizeAlbumInfo({
    artists: albumData.artists.map((artist) => artist.name),
    title: albumData.name,
    catalogNumber: albumData.catalog_number,
    trackNumber: tryParsePositiveInteger(trackNumber),
    trackTotal: albumData.track_count,
    url: albumUrl,
    artwork: albumData.image?.uri,
  });
}

/**
 * Maps a Beatport publisher payload to canonical `PublisherInfo`.
 *
 * This function performs source-specific field mapping and delegates final
 * canonical value normalization to `normalizePublisherInfo()`. It does not log and
 * does not validate the resulting output schema.
 *
 * @param publisherData - Beatport publisher object.
 * @param publisherUrl - Canonical Beatport publisher URL.
 * @returns Canonical `PublisherInfo`, or `undefined` when the mapped value cannot be normalized.
 */
export function mapBeatportPublisherToPublisherInfo(
  publisherData: BeatportPublisherInfo,
  publisherUrl: URL,
): PublisherInfo | undefined {
  return normalizePublisherInfo({
    name: publisherData.name,
    url: publisherUrl,
    logotype: publisherData.image?.uri,
  });
}

/**
 * Maps a Beatport full-track payload to canonical `TrackInfo`.
 *
 * This function performs source-specific field mapping and delegates final
 * canonical value normalization to `normalizeTrackInfo()`. It does not log and
 * does not validate the resulting output schema.
 *
 * @param trackData - Beatport full track object.
 * @param trackUrl - Canonical Beatport track URL.
 * @param album - Canonical mapped album info.
 * @param publisher - Canonical mapped publisher info.
 * @returns Canonical `TrackInfo`, or `undefined` when the mapped value cannot be normalized.
 */
export function mapBeatportTrackToTrackInfo(
  trackData: BeatportTrackInfo,
  trackUrl: URL,
  album: AlbumInfo | undefined,
  publisher: PublisherInfo | undefined,
): TrackInfo | undefined {
  const artists = trackData.artists
    .filter((artist) => artist.type === BeatportArtistType.Artist)
    .map((artist) => artist.name);

  const remixers = trackData.artists
    .filter((artist) =>
      [
        BeatportArtistType.Remixer,
        BeatportArtistType.Beatsource_Remixer,
      ].includes(artist.type),
    )
    .map((artist) => artist.name);

  return normalizeTrackInfo({
    url: trackUrl,
    artists,
    title: normalizeTrackTitle(trackData.track_name, trackData.mix_name),
    remixers,
    released: trackData.release.release_date,
    genre: trackData.genre?.name,
    subgenre: trackData.genre?.sub_genre?.name,
    bpm: trackData.bpm,
    key: trackData.key,
    isrc: trackData.isrc,
    ufid: `track-${trackData.track_id}`,
    waveform: trackData.track_waveform_url.replace('/image_size/{w}x{h}/', '/image/'), // replace dynamic image size URL with the original image URL
    publisher,
    album,
    details: {
      duration: trackData.track_length_ms / 1000.0,
    },
  });
}
