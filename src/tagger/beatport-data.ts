import logger from '#logger';
import { formatZodErrorIssues } from '#tools';

import { extractNextJSData } from './nextjs-data.js';
import {
  beatportAlbumInfoSchema,
  beatportPublisherInfoSchema,
  beatportSearchResultTrackInfoArraySchema,
  beatportTrackInfoSchema,
} from './types.schema.js';

import type {
  BeatportAlbumInfo,
  BeatportLabelInfo,
  BeatportPublisherInfo,
  BeatportReleaseInfo,
  BeatportSearchResultTrackInfo,
  BeatportTrackInfo,
} from './types.js';

export interface BeatportAlbumPayloadResult {
  albumUrl: URL;
  albumData: BeatportAlbumInfo;
}

export interface BeatportPublisherPayloadResult {
  publisherUrl: URL;
  publisherData: BeatportPublisherInfo;
}

export async function fetchBeatportSearchTrackPayload(
  searchURL: string,
  inputKeywords: string[],
): Promise<BeatportSearchResultTrackInfo[] | undefined> {
  const rawTrackArray = await extractNextJSData(
    new URL(searchURL + encodeURIComponent(inputKeywords.join('+'))),
  );

  const parsedTrackArray = beatportSearchResultTrackInfoArraySchema.safeParse(rawTrackArray, {
    reportInput: true,
  });

  if (!parsedTrackArray.success) {
    logger.warn('Cannot validate raw Beatport search results payload', {
      searchKeywords: inputKeywords,
      issues: formatZodErrorIssues(parsedTrackArray.error),
    });

    return undefined;
  }

  return parsedTrackArray.data;
}

export async function fetchBeatportTrackPayload(
  trackUrl: URL,
): Promise<BeatportTrackInfo | undefined> {
  const rawTrackData = await extractNextJSData(trackUrl);

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
  domainURL: string,
  releaseInfo: BeatportReleaseInfo | undefined,
): Promise<BeatportAlbumPayloadResult | undefined> {
  const albumUrl = releaseInfo
    ? new URL(`${domainURL}/release/${releaseInfo.slug}/${releaseInfo.id}`)
    : undefined;

  if (!albumUrl) {
    return undefined;
  }

  const rawAlbumData = await extractNextJSData(albumUrl);

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
  domainURL: string,
  labelInfo: BeatportLabelInfo | undefined,
): Promise<BeatportPublisherPayloadResult | undefined> {
  const publisherUrl = labelInfo
    ? new URL(`${domainURL}/label/${labelInfo.slug}/${labelInfo.id}`)
    : undefined;

  if (!publisherUrl) {
    return undefined;
  }

  const rawPublisherData = await extractNextJSData(publisherUrl);

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
