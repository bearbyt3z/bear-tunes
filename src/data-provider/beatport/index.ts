/**
 * Public API for the Beatport track metadata provider.
 *
 * Exposes the Beatport provider implementation and its configuration type.
 * Raw Beatport payload models, validation schemas, mapping functions, and
 * transport helpers remain internal implementation details.
 *
 * @module data-provider/beatport
 */

import {
  fetchBeatportAlbumPayload,
  fetchBeatportPublisherPayload,
  fetchBeatportSearchTrackPayload,
  fetchBeatportTrackPayload,
} from './beatport-data.js';
import {
  mapBeatportAlbumToAlbumInfo,
  mapBeatportPublisherToPublisherInfo,
  mapBeatportSearchResultTrackToTrackInfo,
  mapBeatportTrackToTrackInfo,
} from './types.mapper.js';

import logger from '#logger';
import {
  formatZodErrorIssues,
} from '#tools';

import {
  DataProvider,
} from '../index.js';

import {
  albumInfoSchema,
  publisherInfoSchema,
  trackInfoSchema,
} from '#shared-types-schema';

import type {
  BeatportDataProviderOptions,
  BeatportLabelInfo,
  BeatportReleaseInfo,
} from './types.js';

import type {
  AlbumInfo,
  PublisherInfo,
  TrackInfo,
} from '#shared-types';

export type {
  BeatportDataProviderOptions,
} from './types.js';

/**
 * Default configuration used by BeatportDataProvider.
 */
const defaultBeatportDataProviderOptions = Object.freeze({
  domainUrl: 'https://www.beatport.com',
  trackSearchPath: '/search/tracks',
  trackSearchQueryParameter: 'q',
  trackSearchParameters: Object.freeze({
    per_page: '150',
  }),
} satisfies BeatportDataProviderOptions);

/**
 * Retrieves canonical track metadata from Beatport.
 */
export class BeatportDataProvider extends DataProvider {
  /**
   * Effective Beatport provider configuration for this instance.
   */
  private readonly options: BeatportDataProviderOptions;

  /**
   * Creates a Beatport data provider with merged default and custom options.
   *
   * @param options - Partial Beatport provider configuration overriding defaults.
   */
  constructor(options: Partial<BeatportDataProviderOptions> = {}) {
    super();

    this.options = {
      ...defaultBeatportDataProviderOptions,
      ...options,
    };
  }

  /**
   * Builds a Beatport track search URL.
   *
   * @returns A new URL for the configured Beatport track search endpoint.
   */
  private getTrackSearchUrl(): URL {
    return new URL(
      this.options.trackSearchPath,
      this.options.domainUrl,
    );
  }

  /**
   * Finds canonical track metadata candidates for the provided search keywords.
   *
   * Each returned candidate contains metadata available in a Beatport search
   * result. Entries that cannot be mapped or validated as canonical TrackInfo
   * are skipped and logged.
   *
   * @param inputKeywords - Keywords used to search Beatport tracks.
   * @returns Candidate metadata, an empty array when no matching Beatport tracks
   * are found, or undefined when Beatport search data is unavailable.
   */
  async findTrackCandidates(
    inputKeywords: readonly string[],
  ): Promise<readonly TrackInfo[] | undefined> {
    const trackEntries = await fetchBeatportSearchTrackPayload(
      this.getTrackSearchUrl(),
      this.options.trackSearchQueryParameter,
      this.options.trackSearchParameters,
      inputKeywords,
    );

    if (trackEntries === undefined) {
      return undefined;
    }

    const result: TrackInfo[] = [];

    for (const trackEntry of trackEntries) {
      const mappedTrackInfo = mapBeatportSearchResultTrackToTrackInfo(
        trackEntry,
        this.options.domainUrl,
      );

      if (mappedTrackInfo === undefined) {
        logger.warn('Cannot map Beatport search result track to TrackInfo', {
          trackId: trackEntry.track_id,
          trackName: trackEntry.track_name,
        });

        continue;
      }

      const parsedTrackInfo = trackInfoSchema.safeParse(mappedTrackInfo, {
        reportInput: true,
      });

      if (!parsedTrackInfo.success) {
        logger.warn('Cannot validate mapped TrackInfo from Beatport search result', {
          trackId: trackEntry.track_id,
          trackName: trackEntry.track_name,
          issues: formatZodErrorIssues(parsedTrackInfo.error),
        });

        continue;
      }

      const trackInfo = parsedTrackInfo.data;

      if (
        trackInfo.title === undefined
        || trackInfo.artists === undefined
        || trackInfo.artists.length === 0
        || trackInfo.details === undefined
      ) {
        continue;
      }

      result.push(trackInfo);
    }

    return result;
  }

  /**
   * Resolves canonical metadata for a selected Beatport track URL.
   *
   * @param trackUrl - URL of the selected Beatport track.
   * @returns Canonical track metadata, or undefined when it cannot be retrieved,
   * mapped, or validated.
   */
  async getTrackInfo(trackUrl: URL): Promise<TrackInfo | undefined> {
    const trackData = await fetchBeatportTrackPayload(trackUrl);

    if (trackData === undefined) {
      return undefined;
    }

    const publisher = await this.getPublisherInfo(trackData.release.label);
    const album = await this.getAlbumInfo(
      trackData.release,
      trackData.number,
    );

    const mappedTrackInfo = mapBeatportTrackToTrackInfo(
      trackData,
      trackUrl,
      album,
      publisher,
    );

    if (mappedTrackInfo === undefined) {
      return undefined;
    }

    const parsedTrackInfo = trackInfoSchema.safeParse(mappedTrackInfo, {
      reportInput: true,
    });

    if (!parsedTrackInfo.success) {
      logger.warn('Cannot validate normalized TrackInfo extracted from Beatport API', {
        trackUrl: trackUrl.toString(),
        issues: formatZodErrorIssues(parsedTrackInfo.error),
      });

      return undefined;
    }

    return parsedTrackInfo.data;
  }

  /**
   * Resolves canonical album metadata from a Beatport release.
   *
   * @param releaseInfo - Beatport release used to retrieve album metadata.
   * @param trackNumber - Track number within the release.
   * @returns Canonical album metadata, or undefined when it cannot be retrieved,
   * mapped, or validated.
   */
  private async getAlbumInfo(
    releaseInfo: BeatportReleaseInfo | undefined,
    trackNumber: number,
  ): Promise<AlbumInfo | undefined> {
    const beatportAlbumPayload = await fetchBeatportAlbumPayload(
      this.options.domainUrl,
      releaseInfo,
    );

    if (beatportAlbumPayload === undefined) {
      return undefined;
    }

    const mappedAlbumInfo = mapBeatportAlbumToAlbumInfo(
      beatportAlbumPayload.albumData,
      beatportAlbumPayload.albumUrl,
      trackNumber,
    );

    if (mappedAlbumInfo === undefined) {
      return undefined;
    }

    const parsedAlbumInfo = albumInfoSchema.safeParse(mappedAlbumInfo, {
      reportInput: true,
    });

    if (!parsedAlbumInfo.success) {
      logger.warn('Cannot validate normalized AlbumInfo extracted from Beatport API', {
        albumUrl: beatportAlbumPayload.albumUrl.toString(),
        issues: formatZodErrorIssues(parsedAlbumInfo.error),
      });

      return undefined;
    }

    return parsedAlbumInfo.data;
  }

  /**
   * Resolves canonical publisher metadata from a Beatport label.
   *
   * @param labelInfo - Beatport label used to retrieve publisher metadata.
   * @returns Canonical publisher metadata, or undefined when it cannot be
   * retrieved, mapped, or validated.
   */
  private async getPublisherInfo(
    labelInfo: BeatportLabelInfo | undefined,
  ): Promise<PublisherInfo | undefined> {
    const beatportPublisherPayload = await fetchBeatportPublisherPayload(
      this.options.domainUrl,
      labelInfo,
    );

    if (beatportPublisherPayload === undefined) {
      return undefined;
    }

    const mappedPublisherInfo = mapBeatportPublisherToPublisherInfo(
      beatportPublisherPayload.publisherData,
      beatportPublisherPayload.publisherUrl,
    );

    if (mappedPublisherInfo === undefined) {
      return undefined;
    }

    const parsedPublisherInfo = publisherInfoSchema.safeParse(
      mappedPublisherInfo,
      {
        reportInput: true,
      },
    );

    if (!parsedPublisherInfo.success) {
      logger.warn('Cannot validate normalized PublisherInfo extracted from Beatport API', {
        publisherUrl: beatportPublisherPayload.publisherUrl.toString(),
        issues: formatZodErrorIssues(parsedPublisherInfo.error),
      });
      return undefined;
    }

    return parsedPublisherInfo.data;
  }
}
