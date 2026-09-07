import type {
  BasicTrackIdentificationStatus,
  TrackInfo,
} from './types.js';

/**
 * Returns the status of basic identification fields in a TrackInfo object.
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
 * Checks whether a TrackInfo has the basic data required to identify a track.
 */
export function hasBasicTrackIdentificationData(track: TrackInfo): boolean {
  const status = getBasicTrackIdentificationStatus(track);
  return Object.values(status).every(Boolean);
}
