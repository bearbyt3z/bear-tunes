import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchBeatportSearchTrackPayload } from './beatport-data.js';

import { BeatportArtistType } from './types.js';

import type {
  BeatportSearchResultTrackInfo,
} from './types.js';

const mocks = vi.hoisted(() => ({
  extractNextJSData: vi.fn(),
  loggerWarn: vi.fn<
    (message: string, context: Record<string, unknown>) => void
  >(),
}));

vi.mock('#logger', () => ({
  default: {
    warn: mocks.loggerWarn,
  },
}));

vi.mock('./nextjs-data.js', () => ({
  extractNextJSData: mocks.extractNextJSData,
}));

const searchUrl = new URL(
  'https://www.beatport.com/search/tracks?source=web',
);

const searchQueryParameter = 'q';

const searchParameters = {
  per_page: '100',
  order: 'relevance',
};

const inputKeywords = ['deep', 'house'];

const expectedRequestUrl = new URL(
  'https://www.beatport.com/search/tracks?source=web&per_page=100&order=relevance&q=deep+house',
);

const validSearchResultTrack: BeatportSearchResultTrackInfo = {
  score: 1,
  artists: [
    {
      artist_id: 101,
      artist_name: 'Example Artist',
      artist_type_name: BeatportArtistType.Artist,
    },
  ],
  label: {
    label_id: 201,
    label_name: 'Example Label',
  },
  mix_name: 'Original Mix',
  release: {
    release_id: 301,
    release_name: 'Example Release',
  },
  release_date: '2025-01-15',
  track_id: 123456,
  track_name: 'Example Track',
  track_number: 1,
  genre: [
    {
      genre_id: 401,
      genre_name: 'House',
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value);
}

function getLoggedWarningContext(
  expectedMessage: string,
): Record<string, unknown> {
  expect(mocks.loggerWarn).toHaveBeenCalledOnce();

  const warningCall = mocks.loggerWarn.mock.calls[0];

  if (warningCall === undefined) {
    throw new Error('Expected logger.warn to be called.');
  }

  const [message, context] = warningCall;

  expect(message).toBe(expectedMessage);

  return context;
}

function getFirstLoggedIssue(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const issues: unknown = context.issues;

  if (!Array.isArray(issues)) {
    throw new Error('Expected logger context to contain an issues array.');
  }

  const firstIssue: unknown = issues[0];

  if (!isRecord(firstIssue)) {
    throw new Error('Expected the first validation issue to be an object.');
  }

  return firstIssue;
}

describe('fetchBeatportSearchTrackPayload', () => {
  beforeEach(() => {
    mocks.extractNextJSData.mockReset();
    mocks.loggerWarn.mockReset();
  });

  it('builds the search URL and returns validated track results', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce([
      validSearchResultTrack,
    ]);

    const result = await fetchBeatportSearchTrackPayload(
      searchUrl,
      searchQueryParameter,
      searchParameters,
      inputKeywords,
    );

    expect(result).toEqual([validSearchResultTrack]);

    expect(mocks.extractNextJSData).toHaveBeenCalledOnce();
    expect(mocks.extractNextJSData).toHaveBeenCalledWith(expectedRequestUrl);

    expect(searchUrl.toString()).toBe(
      'https://www.beatport.com/search/tracks?source=web',
    );

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('returns an empty array when the search has no results', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce([]);

    const result = await fetchBeatportSearchTrackPayload(
      searchUrl,
      searchQueryParameter,
      searchParameters,
      inputKeywords,
    );

    expect(result).toEqual([]);
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('logs a warning and returns undefined when the payload is unavailable', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(undefined);

    const result = await fetchBeatportSearchTrackPayload(
      searchUrl,
      searchQueryParameter,
      searchParameters,
      inputKeywords,
    );

    expect(result).toBeUndefined();

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'No Beatport search results payload available',
      {
        searchKeywords: inputKeywords,
        url: expectedRequestUrl.toString(),
      },
    );
  });

  it.each([
    {
      description: 'null',
      problematicItem: null,
    },
    {
      description: 'a string',
      problematicItem: 'invalid track',
    },
    {
      description: 'a number',
      problematicItem: 42,
    },
  ])(
    'logs the problematic array item when it is $description',
    async ({ problematicItem }) => {
      mocks.extractNextJSData.mockResolvedValueOnce([
        validSearchResultTrack,
        problematicItem,
      ]);

      const result = await fetchBeatportSearchTrackPayload(
        searchUrl,
        searchQueryParameter,
        searchParameters,
        inputKeywords,
      );

      expect(result).toBeUndefined();

      const logContext = getLoggedWarningContext(
        'Cannot validate raw Beatport search results payload',
      );

      expect(logContext.searchKeywords).toEqual(inputKeywords);
      expect(logContext.problematicItem).toBe(problematicItem);

      expect(getFirstLoggedIssue(logContext)).toMatchObject({
        code: 'invalid_type',
        path: '1',
      });
    },
  );

  it('logs validation errors without a problematic item for non-array payloads', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce({
      data: [validSearchResultTrack],
    });

    const result = await fetchBeatportSearchTrackPayload(
      searchUrl,
      searchQueryParameter,
      searchParameters,
      inputKeywords,
    );

    expect(result).toBeUndefined();

    const logContext = getLoggedWarningContext(
      'Cannot validate raw Beatport search results payload',
    );

    expect(logContext.searchKeywords).toEqual(inputKeywords);
    expect(logContext.problematicItem).toBeUndefined();

    expect(getFirstLoggedIssue(logContext)).toMatchObject({
      code: 'invalid_type',
      path: '',
    });
  });

  it('propagates TypeError from Next.js data extraction', async () => {
    const extractionError = new TypeError(
      'Malformed Next.js payload.',
    );

    mocks.extractNextJSData.mockRejectedValueOnce(extractionError);

    await expect(
      fetchBeatportSearchTrackPayload(
        searchUrl,
        searchQueryParameter,
        searchParameters,
        inputKeywords,
      ),
    ).rejects.toBe(extractionError);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });
});
