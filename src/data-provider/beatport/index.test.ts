import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataProvider } from '../index.js';

import { BeatportDataProvider } from './index.js';

import { BeatportArtistType } from './types.js';

import type {
  BeatportDataProviderOptions,
} from './index.js';

import type {
  BeatportSearchResultTrackInfo,
} from './types.js';

const mocks = vi.hoisted(() => ({
  fetchBeatportAlbumPayload: vi.fn(),
  fetchBeatportPublisherPayload: vi.fn(),
  fetchBeatportSearchTrackPayload: vi.fn(),
  fetchBeatportTrackPayload: vi.fn(),
  loggerWarn: vi.fn<
    (message: string, context: Record<string, unknown>) => void
  >(),
}));

vi.mock('./beatport-data.js', () => ({
  fetchBeatportAlbumPayload: mocks.fetchBeatportAlbumPayload,
  fetchBeatportPublisherPayload: mocks.fetchBeatportPublisherPayload,
  fetchBeatportSearchTrackPayload: mocks.fetchBeatportSearchTrackPayload,
  fetchBeatportTrackPayload: mocks.fetchBeatportTrackPayload,
}));

vi.mock('#logger', () => ({
  default: {
    warn: mocks.loggerWarn,
  },
}));

const inputKeywords = ['Adam', 'Beyer'];

const defaultSearchUrl = new URL(
  'https://www.beatport.com/search/tracks',
);

const defaultSearchParameters = {
  per_page: '150',
};

const validSearchResultTrack: BeatportSearchResultTrackInfo = {
  score: 1,
  artists: [
    {
      artist_id: 101,
      artist_name: 'Adam Beyer',
      artist_type_name: BeatportArtistType.Artist,
    },
  ],
  label: {
    label_id: 201,
    label_name: 'Example Label',
  },
  length: 184376,
  mix_name: 'Extended Mix',
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

const expectedTrackInfo = {
  url: new URL(
    'https://www.beatport.com/track/example-track/123456',
  ),
  artists: ['Adam Beyer'],
  title: 'Example Track (Extended Mix)',
  released: new Date('2025-01-15T00:00:00.000Z'),
  year: 2025,
  genre: 'House',
  details: {
    durationMs: 184376,
  },
};

describe('BeatportDataProvider', () => {
  beforeEach(() => {
    mocks.fetchBeatportAlbumPayload.mockReset();
    mocks.fetchBeatportPublisherPayload.mockReset();
    mocks.fetchBeatportSearchTrackPayload.mockReset();
    mocks.fetchBeatportTrackPayload.mockReset();
    mocks.loggerWarn.mockReset();
  });

  it('extends the shared DataProvider base class', () => {
    const provider = new BeatportDataProvider();

    expect(provider).toBeInstanceOf(DataProvider);
  });

  it('uses default configuration when searching for track candidates', async () => {
    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce([]);

    const provider = new BeatportDataProvider();

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toEqual([]);

    expect(mocks.fetchBeatportSearchTrackPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportSearchTrackPayload).toHaveBeenCalledWith(
      defaultSearchUrl,
      'q',
      defaultSearchParameters,
      inputKeywords,
    );
  });

  it('uses caller-supplied configuration overrides', async () => {
    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce([]);

    const searchParameters = {
      order: 'relevance',
      per_page: '25',
    };

    const options: Partial<BeatportDataProviderOptions> = {
      domainUrl: 'https://catalog.example.com',
      trackSearchPath: '/api/v2/tracks',
      trackSearchQueryParameter: 'query',
      trackSearchParameters: searchParameters,
    };

    const provider = new BeatportDataProvider(options);

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toEqual([]);

    expect(mocks.fetchBeatportSearchTrackPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportSearchTrackPayload).toHaveBeenCalledWith(
      new URL('https://catalog.example.com/api/v2/tracks'),
      'query',
      searchParameters,
      inputKeywords,
    );
  });

  it('preserves default configuration for options not overridden by the caller', async () => {
    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce([]);

    const options: Partial<BeatportDataProviderOptions> = {
      trackSearchQueryParameter: 'term',
    };

    const provider = new BeatportDataProvider(options);

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toEqual([]);

    expect(mocks.fetchBeatportSearchTrackPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportSearchTrackPayload).toHaveBeenCalledWith(
      defaultSearchUrl,
      'term',
      defaultSearchParameters,
      inputKeywords,
    );
  });

  it('maps valid Beatport search results to canonical track candidates', async () => {
    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce([
      validSearchResultTrack,
    ]);

    const provider = new BeatportDataProvider();

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toEqual([expectedTrackInfo]);

    expect(mocks.fetchBeatportSearchTrackPayload).toHaveBeenCalledOnce();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('returns undefined when the search payload is unavailable', async () => {
    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce(undefined);

    const provider = new BeatportDataProvider();

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toBeUndefined();

    expect(mocks.fetchBeatportSearchTrackPayload).toHaveBeenCalledOnce();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('skips candidates with missing identification fields or track duration', async () => {
    const trackWithoutTitle: BeatportSearchResultTrackInfo = {
      ...validSearchResultTrack,
      track_id: 123457,
      track_name: '',
    };

    const trackWithoutPrimaryArtist: BeatportSearchResultTrackInfo = {
      ...validSearchResultTrack,
      artists: [
        {
          artist_id: 102,
          artist_name: 'Guest Remixer',
          artist_type_name: BeatportArtistType.Remixer,
        },
      ],
      track_id: 123458,
      track_name: 'Track Without Primary Artist',
    };

    const trackWithoutDuration: BeatportSearchResultTrackInfo = {
      ...validSearchResultTrack,
      track_id: 123459,
      track_name: 'Track Without Duration',
    };

    delete trackWithoutDuration.length;

    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce([
      trackWithoutTitle,
      trackWithoutPrimaryArtist,
      trackWithoutDuration,
      validSearchResultTrack,
    ]);

    const provider = new BeatportDataProvider();

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toEqual([expectedTrackInfo]);

    expect(mocks.loggerWarn).toHaveBeenCalledTimes(3);

    expect(mocks.loggerWarn).toHaveBeenNthCalledWith(
      1,
      'Skipping Beatport search candidate due to missing identification fields',
      {
        trackId: 123457,
        trackName: '',
        identificationStatus: {
          hasTitle: false,
          hasArtists: true,
        },
      },
    );

    expect(mocks.loggerWarn).toHaveBeenNthCalledWith(
      2,
      'Skipping Beatport search candidate due to missing identification fields',
      {
        trackId: 123458,
        trackName: 'Track Without Primary Artist',
        identificationStatus: {
          hasTitle: true,
          hasArtists: false,
        },
      },
    );

    expect(mocks.loggerWarn).toHaveBeenNthCalledWith(
      3,
      'Skipping Beatport search candidate due to missing identification fields',
      {
        trackId: 123459,
        trackName: 'Track Without Duration',
        identificationStatus: {
          hasTitle: true,
          hasArtists: true,
        },
      },
    );
  });

  it('propagates TypeError when the configured search URL is invalid', async () => {
    const provider = new BeatportDataProvider({
      domainUrl: 'invalid-url',
    });

    await expect(
      provider.findTrackCandidates(inputKeywords),
    ).rejects.toBeInstanceOf(TypeError);

    expect(mocks.fetchBeatportSearchTrackPayload).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('propagates TypeError from search payload fetching', async () => {
    const extractionError = new TypeError(
      'Malformed Next.js payload.',
    );

    mocks.fetchBeatportSearchTrackPayload.mockRejectedValueOnce(
      extractionError,
    );

    const provider = new BeatportDataProvider();

    await expect(
      provider.findTrackCandidates(inputKeywords),
    ).rejects.toBe(extractionError);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });
});
