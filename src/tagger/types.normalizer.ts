import {
  BeatportSearchResultArtistType,
} from './types.js';

import {
  normalizeTrackInfo,
} from '#shared-types-normalizer';

import {
  roundToDecimalPlaces,
  slugify,
} from '#tools';

import type {
  BeatportSearchResultTrackInfo,
} from './types.js';

import type {
  TrackInfo,
} from '#shared-types';

/**
 * Normalizes a raw Beatport search-result track entry into canonical `TrackInfo`.
 *
 * This function performs only mapping + normalization. It does not log and does
 * not validate the normalized output schema.
 *
 * @param trackEntry - Raw Beatport search result track object.
 * @param domainURL - Beatport domain URL used to build the canonical track URL.
 * @returns Normalized `TrackInfo`, or `undefined` when normalization fails.
 */
export function normalizeBeatportSearchResultTrackInfo(
  trackEntry: BeatportSearchResultTrackInfo,
  domainURL: string,
): TrackInfo | undefined {
  const artists = trackEntry.artists
    .filter((artist) => artist.artist_type_name === BeatportSearchResultArtistType.Artist)
    .map((artist) => artist.artist_name);

  const remixers = trackEntry.artists
    .filter((artist) => artist.artist_type_name === BeatportSearchResultArtistType.Remixer)
    .map((artist) => artist.artist_name);

  const [genre, subgenre] = trackEntry.genre.map((genreEntry) => genreEntry.genre_name);

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
    details: {
      duration: roundToDecimalPlaces(trackEntry.length / 1000.0, 2),
    },
  });
}
