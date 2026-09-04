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
