import type {
  BasicTrackIdentificationStatus,
  TrackInfo,
} from './types.js';

/**
 * Gets the status of the basic track identification fields.
 *
 * A title is present when it is defined and contains non-whitespace characters.
 * Artists are present when the artists array contains at least one entry.
 *
 * @param track - Track metadata to inspect.
 * @returns Status of the title and artists array.
 */
export function getBasicTrackIdentificationStatus(
  track: TrackInfo,
): BasicTrackIdentificationStatus {
  return {
    hasTitle: track.title !== undefined && track.title.trim() !== '',
    hasArtists: track.artists !== undefined && track.artists.length > 0,
  };
}

/**
 * Checks whether a track has the basic data required for identification.
 *
 * A track qualifies when its title contains non-whitespace characters and its
 * artists array contains at least one entry.
 *
 * @param track - Track metadata to inspect.
 * @returns `true` when both basic identification requirements are met.
 */
export function hasBasicTrackIdentificationData(track: TrackInfo): boolean {
  const status = getBasicTrackIdentificationStatus(track);

  return status.hasTitle && status.hasArtists;
}
