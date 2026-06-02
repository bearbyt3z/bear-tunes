import {
  BeatportSearchResultArtistType,
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
} from '#tools';

import type {
  BeatportAlbumInfo,
  BeatportArtistInfo,
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
 * @param domainURL - Beatport domain URL used to build the canonical track URL.
 * @returns Canonical `TrackInfo`, or `undefined` when the mapped value cannot be normalized.
 */
export function mapBeatportSearchResultTrackToTrackInfo(
  trackEntry: BeatportSearchResultTrackInfo,
  domainURL: string,
): TrackInfo | undefined {
  const artists = trackEntry.artists
    .filter((artist) => artist.artist_type_name === BeatportSearchResultArtistType.Artist)
    .map((artist) => artist.artist_name);

  const remixers = trackEntry.artists
    .filter((artist) =>
      [
        BeatportSearchResultArtistType.Remixer,
        BeatportSearchResultArtistType.Beatsource_Remixer,
      ].includes(artist.artist_type_name),
    )
    .map((artist) => artist.artist_name);

  const [genre, subgenre] = trackEntry.genre.map((genreEntry) => genreEntry.genre_name);

  const details = (trackEntry.length === undefined) ? undefined : { duration: trackEntry.length / 1000 };

  return normalizeTrackInfo({
    url: `${domainURL}/track/${slugify(trackEntry.track_name)}/${trackEntry.track_id}`,
    artists,
    title: trackEntry.mix_name ? `${trackEntry.track_name} (${trackEntry.mix_name})` : trackEntry.track_name,
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
  trackNumber: number,
): AlbumInfo | undefined {
  return normalizeAlbumInfo({
    artists: albumData.artists.map((artist: BeatportArtistInfo) => artist.name),
    title: albumData.name,
    catalogNumber: albumData.catalog_number,
    trackNumber,
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
 * @param forceRadioEdit - Whether to force the track title to Radio Edit.
 * @param album - Canonical mapped album info.
 * @param publisher - Canonical mapped publisher info.
 * @returns Canonical `TrackInfo`, or `undefined` when the mapped value cannot be normalized.
 */
export function mapBeatportTrackToTrackInfo(
  trackData: BeatportTrackInfo,
  trackUrl: URL,
  forceRadioEdit: boolean,
  album: AlbumInfo | undefined,
  publisher: PublisherInfo | undefined,
): TrackInfo | undefined {
  let title = normalizeTrackTitle(trackData.name, trackData.mix_name);

  if (forceRadioEdit) {
    const match = title.match(/Original Mix|Extended Mix/i);

    if (match != null && match.length >= 1) {
      title = title.replace(match[0], 'Radio Edit');
    } else {
      title += ' (Radio Edit)';
    }
  }

  return normalizeTrackInfo({
    url: trackUrl,
    artists: trackData.artists.map((artist: BeatportArtistInfo) => artist.name),
    title,
    remixers: trackData.remixers.map((artist: BeatportArtistInfo) => artist.name),
    released: trackData.new_release_date,
    genre: trackData.genre?.name,
    subgenre: trackData.sub_genre?.name,
    bpm: trackData.bpm,
    key: trackData.key?.name,
    isrc: trackData.isrc,
    ufid: `track-${trackData.id}`,
    waveform: trackData.image?.uri,
    publisher,
    album,
    details: {
      duration: trackData.length_ms / 1000.0,
    },
  });
}
