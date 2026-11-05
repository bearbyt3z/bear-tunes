import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchBeatportAlbumPayload,
  fetchBeatportPublisherPayload,
  fetchBeatportSearchTrackPayload,
  fetchBeatportTrackPayload,
} from './beatport-data.js';

import {
  getFirstLoggedIssue,
  getLoggedWarningContext,
} from './test-utils.js';

import { BeatportArtistType } from './types.js';

import type {
  BeatportAlbumInfo,
  BeatportPublisherInfo,
  BeatportSearchResultTrackInfo,
  BeatportTrackInfo,
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

const trackUrl = new URL(
  'https://www.beatport.com/track/example-track/123456',
);

const validTrackData: BeatportTrackInfo = {
  artists: [
    {
      id: 101,
      name: 'Primary Artist',
      type: BeatportArtistType.Artist,
    },
  ],
  genre: {
    id: 201,
    name: 'House',
    sub_genre: {
      id: 202,
      name: 'Soulful',
    },
  },
  track_id: 123456,
  track_waveform_url: 'https://example.com/image_size/1400x1400/waveform.png',
  key: 'C Minor',
  track_length_ms: 184376,
  mix_name: 'Extended Mix',
  track_name: 'Example Track',
  track_number: 3,
  release: {
    id: 301,
    name: 'Example Release',
    image_url: 'https://example.com/release.jpg',
    release_date: '2025-01-15',
    slug: 'example-release',
  },
  label: {
    id: 401,
    name: 'Example Label',
    slug: 'example-label',
  },
  bpm: 128.5,
  isrc: 'USRC17607839',
};

const validAlbumData: BeatportAlbumInfo = {
  artists: [
    {
      id: 101,
      name: 'Primary Artist',
    },
    {
      id: 102,
      name: 'Second Artist',
    },
  ],
  bpm_range: {
    min: 120,
    max: 130,
  },
  catalog_number: 'CAT-001',
  id: 123456,
  image: {
    id: 201,
    uri: 'https://example.com/image_size/1400x1400/album.jpg',
  },
  label: {
    id: 301,
    name: 'Example Label',
    slug: 'example-label',
  },
  name: 'Example Album',
  new_release_date: '2025-01-15',
  remixers: [],
  slug: 'example-album',
  tracks: [],
  track_count: 12,
};

const validPublisherData: BeatportPublisherInfo = {
  id: 401,
  image_url: 'https://example.com/label.jpg',
  name: 'Example Label',
  slug: 'example-label',
};

const domainUrl = 'https://www.beatport.com';

const expectedAlbumUrl = new URL(
  'https://www.beatport.com/release/example-release/301',
);

const expectedPublisherUrl = new URL(
  'https://www.beatport.com/label/example-label/401',
);

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
        mocks.loggerWarn.mock.calls,
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
      mocks.loggerWarn.mock.calls,
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

describe('fetchBeatportTrackPayload', () => {
  beforeEach(() => {
    mocks.extractNextJSData.mockReset();
    mocks.loggerWarn.mockReset();
  });

  it('returns validated track metadata', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(validTrackData);

    const result = await fetchBeatportTrackPayload(trackUrl);

    expect(result).toEqual(validTrackData);

    expect(mocks.extractNextJSData).toHaveBeenCalledOnce();
    expect(mocks.extractNextJSData).toHaveBeenCalledWith(trackUrl);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('logs a warning and returns undefined when the payload is unavailable', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(undefined);

    const result = await fetchBeatportTrackPayload(trackUrl);

    expect(result).toBeUndefined();

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'No Beatport track payload available',
      {
        trackUrl: trackUrl.toString(),
      },
    );
  });

  it('logs validation errors and returns undefined for an invalid payload', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(null);

    const result = await fetchBeatportTrackPayload(trackUrl);

    expect(result).toBeUndefined();

    const logContext = getLoggedWarningContext(
      mocks.loggerWarn.mock.calls,
      'Cannot validate raw Beatport track payload',
    );

    expect(logContext.trackUrl).toBe(trackUrl.toString());

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
      fetchBeatportTrackPayload(trackUrl),
    ).rejects.toBe(extractionError);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });
});

describe('fetchBeatportAlbumPayload', () => {
  beforeEach(() => {
    mocks.extractNextJSData.mockReset();
    mocks.loggerWarn.mockReset();
  });

  it('constructs the album URL and returns validated album metadata', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(validAlbumData);

    const result = await fetchBeatportAlbumPayload(
      domainUrl,
      validTrackData.release,
    );

    expect(result).toEqual({
      albumUrl: expectedAlbumUrl,
      albumData: validAlbumData,
    });

    expect(mocks.extractNextJSData).toHaveBeenCalledOnce();
    expect(mocks.extractNextJSData).toHaveBeenCalledWith(expectedAlbumUrl);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('returns undefined without making a request when release information is missing', async () => {
    const result = await fetchBeatportAlbumPayload(
      domainUrl,
      undefined,
    );

    expect(result).toBeUndefined();

    expect(mocks.extractNextJSData).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('logs a warning and returns undefined when the payload is unavailable', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(undefined);

    const result = await fetchBeatportAlbumPayload(
      domainUrl,
      validTrackData.release,
    );

    expect(result).toBeUndefined();

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'No Beatport album payload available',
      {
        albumUrl: expectedAlbumUrl.toString(),
      },
    );
  });

  it('logs validation errors and returns undefined for an invalid payload', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(null);

    const result = await fetchBeatportAlbumPayload(
      domainUrl,
      validTrackData.release,
    );

    expect(result).toBeUndefined();

    const logContext = getLoggedWarningContext(
      mocks.loggerWarn.mock.calls,
      'Cannot validate raw Beatport album payload',
    );

    expect(logContext.albumUrl).toBe(expectedAlbumUrl.toString());

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
      fetchBeatportAlbumPayload(
        domainUrl,
        validTrackData.release,
      ),
    ).rejects.toBe(extractionError);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('propagates TypeError when the album URL cannot be constructed', async () => {
    await expect(
      fetchBeatportAlbumPayload(
        'not-a-valid-url',
        validTrackData.release,
      ),
    ).rejects.toBeInstanceOf(TypeError);

    expect(mocks.extractNextJSData).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });
});

describe('fetchBeatportPublisherPayload', () => {
  beforeEach(() => {
    mocks.extractNextJSData.mockReset();
    mocks.loggerWarn.mockReset();
  });

  it('constructs the publisher URL and returns validated publisher metadata', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(validPublisherData);

    const result = await fetchBeatportPublisherPayload(
      domainUrl,
      validTrackData.label,
    );

    expect(result).toEqual({
      publisherUrl: expectedPublisherUrl,
      publisherData: validPublisherData,
    });

    expect(mocks.extractNextJSData).toHaveBeenCalledOnce();
    expect(mocks.extractNextJSData).toHaveBeenCalledWith(
      expectedPublisherUrl,
    );

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('accepts null as the publisher image URL', async () => {
    const publisherData: BeatportPublisherInfo = {
      ...validPublisherData,
      image_url: null,
    };

    mocks.extractNextJSData.mockResolvedValueOnce(publisherData);

    const result = await fetchBeatportPublisherPayload(
      domainUrl,
      validTrackData.label,
    );

    expect(result).toEqual({
      publisherUrl: expectedPublisherUrl,
      publisherData,
    });

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('returns undefined without making a request when label information is missing', async () => {
    const result = await fetchBeatportPublisherPayload(
      domainUrl,
      undefined,
    );

    expect(result).toBeUndefined();

    expect(mocks.extractNextJSData).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('logs a warning and returns undefined when the payload is unavailable', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(undefined);

    const result = await fetchBeatportPublisherPayload(
      domainUrl,
      validTrackData.label,
    );

    expect(result).toBeUndefined();

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'No Beatport publisher payload available',
      {
        publisherUrl: expectedPublisherUrl.toString(),
      },
    );
  });

  it('logs validation errors and returns undefined for an invalid payload', async () => {
    mocks.extractNextJSData.mockResolvedValueOnce(null);

    const result = await fetchBeatportPublisherPayload(
      domainUrl,
      validTrackData.label,
    );

    expect(result).toBeUndefined();

    const logContext = getLoggedWarningContext(
      mocks.loggerWarn.mock.calls,
      'Cannot validate raw Beatport publisher payload',
    );

    expect(logContext.publisherUrl).toBe(
      expectedPublisherUrl.toString(),
    );

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
      fetchBeatportPublisherPayload(
        domainUrl,
        validTrackData.label,
      ),
    ).rejects.toBe(extractionError);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('propagates TypeError when the publisher URL cannot be constructed', async () => {
    await expect(
      fetchBeatportPublisherPayload(
        'not-a-valid-url',
        validTrackData.label,
      ),
    ).rejects.toBeInstanceOf(TypeError);

    expect(mocks.extractNextJSData).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });
});
