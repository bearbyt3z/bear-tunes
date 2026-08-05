import type {
  TrackInfo,
} from '#shared-types';

/**
 * Defines the common contract for external track metadata providers.
 *
 * A data provider searches a remote metadata source for track candidates and
 * resolves canonical metadata for a selected track URL. Provider-specific
 * payload structures, transport mechanisms, and data mapping remain internal
 * to each implementation.
 */
export abstract class DataProvider {
  /**
   * Finds canonical track metadata candidates for the provided search keywords.
   *
   * Returned candidates may contain only the metadata available from the
   * provider search result. The caller selects the most appropriate candidate.
   *
   * @param inputKeywords - Keywords used to search the remote metadata source.
   * @returns Candidate track metadata, or `undefined` when no candidates are available.
   */
  abstract findTrackCandidates(
    inputKeywords: readonly string[],
  ): Promise<readonly TrackInfo[] | undefined>;

  /**
   * Resolves canonical metadata for a selected remote track URL.
   *
   * @param trackUrl - URL of the selected remote track.
   * @returns Canonical track metadata, or `undefined` when it cannot be resolved.
   */
  abstract getTrackInfo(
    trackUrl: URL,
  ): Promise<TrackInfo | undefined>;
}
