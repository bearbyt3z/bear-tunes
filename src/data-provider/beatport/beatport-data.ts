import logger from '#logger';
import {
  formatZodErrorIssues,
  isRecordArray,
} from '#tools';

import { extractNextJSData } from './nextjs-data.js';
import {
  beatportAlbumInfoSchema,
  beatportPublisherInfoSchema,
  beatportSearchResultTrackInfoArraySchema,
  beatportTrackInfoSchema,
} from './types.schema.js';

import type {
  BeatportAlbumPayloadResult,
  BeatportLabelInfo,
  BeatportPublisherPayloadResult,
  BeatportReleaseInfo,
  BeatportSearchResultTrackInfo,
  BeatportTrackInfo,
} from './types.js';

/**
 * Returns the first array item referenced by validation issues.
 *
 * The function reads the first path segment from each issue and returns the
 * matching item when the segment is a numeric array index.
 *
 * Usage:
 * ```ts
 * const problematicItem = getProblematicArrayItem(rawTrackArray, issues);
 * ```
 *
 * @typeParam T - Type of objects stored in the input array.
 * @param input - Array to read the problematic item from.
 * @param issues - Validation issues whose paths may point to array items.
 * @returns The item at the first numeric index found in issue paths, or `undefined` if no such index exists.
 */
function getProblematicArrayItem<T extends object>(
  input: readonly T[],
  issues: { path: unknown[] }[],
): T | undefined {
  for (const issue of issues) {
    const [firstPathSegment] = issue.path;

    if (typeof firstPathSegment === 'number') {
      return input[firstPathSegment];
    }
  }

  return undefined;
}

/**
 * Fetches and validates Beatport search results for the given keywords.
 *
 * The function builds a search URL from the provided base URL, query parameter
 * and additional search parameters, requests the Next.js data payload, and
 * validates the response against the shared search-result track info schema.
 * If the payload is missing or fails validation, a warning is logged and
 * `undefined` is returned.
 *
 * @param searchUrl - Base URL of the Beatport track search endpoint.
 * @param searchQueryParameter - Name of the query parameter used for the search keywords.
 * @param searchParameters - Additional query parameters to include in the search request.
 * @param inputKeywords - Keywords used to search for tracks on Beatport.
 * @returns An array of validated search result track info objects, or `undefined`
 * when the payload is unavailable or invalid.
 */
export async function fetchBeatportSearchTrackPayload(
  searchUrl: URL,
  searchQueryParameter: string,
  searchParameters: Readonly<Record<string, string>>,
  inputKeywords: readonly string[],
): Promise<BeatportSearchResultTrackInfo[] | undefined> {
  const requestUrl = new URL(searchUrl);

  for (const [parameterName, parameterValue] of Object.entries(searchParameters)) {
    requestUrl.searchParams.set(parameterName, parameterValue);
  }

  requestUrl.searchParams.set(
    searchQueryParameter,
    inputKeywords.join(' '),
  );

  const rawTrackArray = await extractNextJSData(requestUrl);

  if (rawTrackArray === undefined) {
    logger.warn('No Beatport search results payload available', {
      searchKeywords: inputKeywords,
      url: requestUrl.toString(),
    });

    return undefined;
  }

  const parsedTrackArray = beatportSearchResultTrackInfoArraySchema.safeParse(rawTrackArray, {
    reportInput: true,
  });

  if (!parsedTrackArray.success) {
    const problematicItem = isRecordArray(rawTrackArray)
      ? getProblematicArrayItem(rawTrackArray, parsedTrackArray.error.issues)
      : undefined;

    logger.warn('Cannot validate raw Beatport search results payload', {
      searchKeywords: inputKeywords,
      issues: formatZodErrorIssues(parsedTrackArray.error),
      problematicItem: problematicItem,
    });

    return undefined;
  }

  return parsedTrackArray.data;
}

/**
 * Fetches and validates Beatport metadata for a single track.
 *
 * The function requests the Next.js data payload for the provided track URL
 * and validates the response against the shared Beatport track info schema.
 * If the payload is missing or fails validation, a warning is logged and
 * `undefined` is returned.
 *
 * @param trackUrl - URL of the Beatport track page.
 * @returns Validated Beatport track info, or `undefined` when the payload
 * is unavailable or invalid.
 */
export async function fetchBeatportTrackPayload(
  trackUrl: URL,
): Promise<BeatportTrackInfo | undefined> {
  const rawTrackData = await extractNextJSData(trackUrl);

  if (rawTrackData === undefined) {
    logger.warn('No Beatport track payload available', {
      trackUrl: trackUrl.toString(),
    });

    return undefined;
  }

  const parsedTrackData = beatportTrackInfoSchema.safeParse(rawTrackData, {
    reportInput: true,
  });

  if (!parsedTrackData.success) {
    logger.warn('Cannot validate raw Beatport track payload', {
      trackUrl: trackUrl.toString(),
      issues: formatZodErrorIssues(parsedTrackData.error),
    });

    return undefined;
  }

  return parsedTrackData.data;
}

/**
 * Fetches and validates Beatport metadata for a release (album).
 *
 * The function constructs the release URL from the domain URL and release
 * information, requests the Next.js data payload, and validates the response
 * against the shared Beatport album info schema. If the release info is
 * missing, the URL cannot be built, or the payload is unavailable or invalid,
 * a warning is logged (when applicable) and `undefined` is returned.
 *
 * @param domainUrl - Base domain URL for Beatport (e.g. `https://www.beatport.com`).
 * @param releaseInfo - Release metadata used to build the album URL.
 * @returns An object containing the album URL and validated album info, or
 * `undefined` when the release info is missing or the payload is unavailable
 * or invalid.
 */
export async function fetchBeatportAlbumPayload(
  domainUrl: string,
  releaseInfo: BeatportReleaseInfo | undefined,
): Promise<BeatportAlbumPayloadResult | undefined> {
  const albumUrl = releaseInfo
    ? new URL(`${domainUrl}/release/${releaseInfo.slug}/${releaseInfo.id}`)
    : undefined;

  if (!albumUrl) {
    return undefined;
  }

  const rawAlbumData = await extractNextJSData(albumUrl);

  if (rawAlbumData === undefined) {
    logger.warn('No Beatport album payload available', {
      albumUrl: albumUrl.toString(),
    });

    return undefined;
  }

  const parsedAlbumData = beatportAlbumInfoSchema.safeParse(rawAlbumData);

  if (!parsedAlbumData.success) {
    logger.warn('Cannot validate raw Beatport album payload', {
      albumUrl: albumUrl.toString(),
      issues: formatZodErrorIssues(parsedAlbumData.error),
    });

    return undefined;
  }

  return {
    albumUrl,
    albumData: parsedAlbumData.data,
  };
}

/**
 * Fetches and validates Beatport metadata for a label (publisher).
 *
 * The function constructs the label URL from the domain URL and label
 * information, requests the Next.js data payload, and validates the response
 * against the shared Beatport publisher info schema. If the label info is
 * missing, the URL cannot be built, or the payload is unavailable or invalid,
 * a warning is logged (when applicable) and `undefined` is returned.
 *
 * @param domainUrl - Base domain URL for Beatport (e.g. `https://www.beatport.com`).
 * @param labelInfo - Label metadata used to build the publisher URL.
 * @returns An object containing the publisher URL and validated publisher info, or
 * `undefined` when the label info is missing or the payload is unavailable
 * or invalid.
 */
export async function fetchBeatportPublisherPayload(
  domainUrl: string,
  labelInfo: BeatportLabelInfo | undefined,
): Promise<BeatportPublisherPayloadResult | undefined> {
  const publisherUrl = labelInfo
    ? new URL(`${domainUrl}/label/${labelInfo.slug}/${labelInfo.id}`)
    : undefined;

  if (!publisherUrl) {
    return undefined;
  }

  const rawPublisherData = await extractNextJSData(publisherUrl);

  if (rawPublisherData === undefined) {
    logger.warn('No Beatport publisher payload available', {
      publisherUrl: publisherUrl.toString(),
    });

    return undefined;
  }

  const parsedPublisherData = beatportPublisherInfoSchema.safeParse(rawPublisherData);

  if (!parsedPublisherData.success) {
    logger.warn('Cannot validate raw Beatport publisher payload', {
      publisherUrl: publisherUrl.toString(),
      issues: formatZodErrorIssues(parsedPublisherData.error),
    });

    return undefined;
  }

  return {
    publisherUrl,
    publisherData: parsedPublisherData.data,
  };
}
