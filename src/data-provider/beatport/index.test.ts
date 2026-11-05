import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataProvider } from '../index.js';

import { BeatportDataProvider } from './index.js';

import {
  getFirstLoggedIssue,
  getLoggedWarningContext,
} from './test-utils.js';

import { BeatportArtistType } from './types.js';

import * as beatportMappers from './types.mapper.js';

import type {
  AlbumInfo,
  PublisherInfo,
  TrackInfo,
} from '#shared-types';

import type {
  BeatportDataProviderOptions,
} from './index.js';

import type {
  BeatportAlbumInfo,
  BeatportAlbumPayloadResult,
  BeatportPublisherInfo,
  BeatportPublisherPayloadResult,
  BeatportSearchResultTrackInfo,
  BeatportTrackInfo,
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

vi.mock('./types.mapper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./types.mapper.js')>();

  return {
    ...actual,
    mapBeatportAlbumToAlbumInfo: vi.fn(
      actual.mapBeatportAlbumToAlbumInfo,
    ),
    mapBeatportPublisherToPublisherInfo: vi.fn(
      actual.mapBeatportPublisherToPublisherInfo,
    ),
    mapBeatportSearchResultTrackToTrackInfo: vi.fn(
      actual.mapBeatportSearchResultTrackToTrackInfo,
    ),
    mapBeatportTrackToTrackInfo: vi.fn(
      actual.mapBeatportTrackToTrackInfo,
    ),
  };
});

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

const domainUrl = 'https://www.beatport.com';

const trackUrl = new URL(
  'https://www.beatport.com/track/example-track/123456',
);

const expectedAlbumUrl = new URL(
  'https://www.beatport.com/release/example-release/301',
);

const expectedPublisherUrl = new URL(
  'https://www.beatport.com/label/example-label/401',
);

const validDetailedTrackData: BeatportTrackInfo = {
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

const validDetailedAlbumData: BeatportAlbumInfo = {
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
  id: 301,
  image: {
    id: 201,
    uri: 'https://example.com/image_size/1400x1400/album.jpg',
  },
  label: {
    id: 401,
    name: 'Example Label',
    slug: 'example-label',
  },
  name: 'Example Album',
  new_release_date: '2025-01-15',
  remixers: [],
  slug: 'example-release',
  tracks: [],
  track_count: 12,
};

const validDetailedPublisherData: BeatportPublisherInfo = {
  id: 401,
  image_url: 'https://example.com/label.jpg',
  name: 'Example Label',
  slug: 'example-label',
};

const expectedDetailedTrackInfo = {
  url: trackUrl,
  artists: ['Primary Artist'],
  title: 'Example Track (Extended Mix)',
  released: new Date('2025-01-15T00:00:00.000Z'),
  year: 2025,
  genre: 'House',
  subgenre: 'Soulful',
  bpm: 128.5,
  key: 'Cm',
  isrc: 'USRC17607839',
  ufid: 'track-123456',
  waveform: new URL('https://example.com/image/waveform.png'),
  album: {
    title: 'Example Album',
    artists: ['Primary Artist', 'Second Artist'],
    catalogNumber: 'CAT-001',
    trackNumber: 3,
    trackTotal: 12,
    url: expectedAlbumUrl,
    artwork: new URL('https://example.com/image/album.jpg'),
  },
  publisher: {
    name: 'Example Label',
    url: expectedPublisherUrl,
    logotype: new URL('https://example.com/label.jpg'),
  },
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

    vi.mocked(
      beatportMappers.mapBeatportAlbumToAlbumInfo,
    ).mockClear();

    vi.mocked(
      beatportMappers.mapBeatportPublisherToPublisherInfo,
    ).mockClear();

    vi.mocked(
      beatportMappers.mapBeatportSearchResultTrackToTrackInfo,
    ).mockClear();

    vi.mocked(
      beatportMappers.mapBeatportTrackToTrackInfo,
    ).mockClear();
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

  it('returns canonical track metadata with album and publisher information', async () => {
    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce({
      albumUrl: expectedAlbumUrl,
      albumData: validDetailedAlbumData,
    });

    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce({
      publisherUrl: expectedPublisherUrl,
      publisherData: validDetailedPublisherData,
    });

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toEqual(expectedDetailedTrackInfo);

    expect(mocks.fetchBeatportTrackPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportTrackPayload).toHaveBeenCalledWith(trackUrl);

    expect(mocks.fetchBeatportAlbumPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportAlbumPayload).toHaveBeenCalledWith(
      domainUrl,
      validDetailedTrackData.release,
    );

    expect(mocks.fetchBeatportPublisherPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportPublisherPayload).toHaveBeenCalledWith(
      domainUrl,
      validDetailedTrackData.label,
    );

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('returns undefined when the main track payload is unavailable', async () => {
    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(undefined);

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toBeUndefined();

    expect(mocks.fetchBeatportTrackPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportAlbumPayload).not.toHaveBeenCalled();
    expect(mocks.fetchBeatportPublisherPayload).not.toHaveBeenCalled();

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('returns track metadata when album information is unavailable', async () => {
    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce(undefined);

    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce({
      publisherUrl: expectedPublisherUrl,
      publisherData: validDetailedPublisherData,
    });

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toMatchObject({
      url: trackUrl,
      title: 'Example Track (Extended Mix)',
      publisher: expectedDetailedTrackInfo.publisher,
    });

    expect(result).not.toHaveProperty('album');

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('returns track metadata when publisher information is unavailable', async () => {
    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce({
      albumUrl: expectedAlbumUrl,
      albumData: validDetailedAlbumData,
    });

    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce(undefined);

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toMatchObject({
      url: trackUrl,
      title: 'Example Track (Extended Mix)',
      album: expectedDetailedTrackInfo.album,
    });

    expect(result).not.toHaveProperty('publisher');

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('omits album and publisher metadata when their mapped values cannot be normalized', async () => {
    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce({
      albumUrl: expectedAlbumUrl,
      albumData: {
        ...validDetailedAlbumData,
        name: '   ',
      },
    });

    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce({
      publisherUrl: expectedPublisherUrl,
      publisherData: {
        ...validDetailedPublisherData,
        name: '   ',
      },
    });

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toMatchObject({
      url: trackUrl,
      title: 'Example Track (Extended Mix)',
      details: {
        durationMs: 184376,
      },
    });

    expect(result).not.toHaveProperty('album');
    expect(result).not.toHaveProperty('publisher');

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('propagates TypeError from main track payload fetching', async () => {
    const extractionError = new TypeError(
      'Malformed Next.js payload.',
    );

    mocks.fetchBeatportTrackPayload.mockRejectedValueOnce(extractionError);

    const provider = new BeatportDataProvider();

    await expect(
      provider.getTrackInfo(trackUrl),
    ).rejects.toBe(extractionError);

    expect(mocks.fetchBeatportAlbumPayload).not.toHaveBeenCalled();
    expect(mocks.fetchBeatportPublisherPayload).not.toHaveBeenCalled();

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('propagates TypeError from album metadata fetching', async () => {
    const extractionError = new TypeError(
      'Malformed album payload.',
    );

    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockRejectedValueOnce(extractionError);

    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce({
      publisherUrl: expectedPublisherUrl,
      publisherData: validDetailedPublisherData,
    });

    const provider = new BeatportDataProvider();

    await expect(
      provider.getTrackInfo(trackUrl),
    ).rejects.toBe(extractionError);

    expect(mocks.fetchBeatportAlbumPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportPublisherPayload).toHaveBeenCalledOnce();

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('propagates TypeError from publisher metadata fetching', async () => {
    const extractionError = new TypeError(
      'Malformed publisher payload.',
    );

    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce({
      albumUrl: expectedAlbumUrl,
      albumData: validDetailedAlbumData,
    });

    mocks.fetchBeatportPublisherPayload.mockRejectedValueOnce(extractionError);

    const provider = new BeatportDataProvider();

    await expect(
      provider.getTrackInfo(trackUrl),
    ).rejects.toBe(extractionError);

    expect(mocks.fetchBeatportAlbumPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportPublisherPayload).toHaveBeenCalledOnce();

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('fetches album and publisher metadata concurrently', async () => {
    let resolveAlbumPayload!: (
      value: BeatportAlbumPayloadResult | undefined,
    ) => void;

    let resolvePublisherPayload!: (
      value: BeatportPublisherPayloadResult | undefined,
    ) => void;

    const albumPayloadPromise = new Promise<
      BeatportAlbumPayloadResult | undefined
    >((resolve) => {
      resolveAlbumPayload = resolve;
    });

    const publisherPayloadPromise = new Promise<
      BeatportPublisherPayloadResult | undefined
    >((resolve) => {
      resolvePublisherPayload = resolve;
    });

    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockReturnValueOnce(
      albumPayloadPromise,
    );

    mocks.fetchBeatportPublisherPayload.mockReturnValueOnce(
      publisherPayloadPromise,
    );

    const provider = new BeatportDataProvider();

    const resultPromise = provider.getTrackInfo(trackUrl);

    await Promise.resolve();

    expect(mocks.fetchBeatportAlbumPayload).toHaveBeenCalledOnce();
    expect(mocks.fetchBeatportPublisherPayload).toHaveBeenCalledOnce();

    resolveAlbumPayload({
      albumUrl: expectedAlbumUrl,
      albumData: validDetailedAlbumData,
    });

    resolvePublisherPayload({
      publisherUrl: expectedPublisherUrl,
      publisherData: validDetailedPublisherData,
    });

    await expect(resultPromise).resolves.toEqual(expectedDetailedTrackInfo);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('uses the configured domain URL when fetching album and publisher metadata', async () => {
    const customDomainUrl = 'https://catalog.example.com';

    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce({
      albumUrl: expectedAlbumUrl,
      albumData: validDetailedAlbumData,
    });

    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce({
      publisherUrl: expectedPublisherUrl,
      publisherData: validDetailedPublisherData,
    });

    const provider = new BeatportDataProvider({
      domainUrl: customDomainUrl,
    });

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toEqual(expectedDetailedTrackInfo);

    expect(mocks.fetchBeatportAlbumPayload).toHaveBeenCalledWith(
      customDomainUrl,
      validDetailedTrackData.release,
    );

    expect(mocks.fetchBeatportPublisherPayload).toHaveBeenCalledWith(
      customDomainUrl,
      validDetailedTrackData.label,
    );

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('uses the configured domain URL when mapping track candidates', async () => {
    const customDomainUrl = 'https://catalog.example.com/';

    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce([
      validSearchResultTrack,
    ]);

    const provider = new BeatportDataProvider({
      domainUrl: customDomainUrl,
    });

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toEqual([
      {
        ...expectedTrackInfo,
        url: new URL(
          'https://catalog.example.com/track/example-track/123456',
        ),
      },
    ]);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('logs a warning and skips search results that cannot be mapped', async () => {
    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce([
      validSearchResultTrack,
    ]);

    vi.mocked(
      beatportMappers.mapBeatportSearchResultTrackToTrackInfo,
    ).mockReturnValueOnce(undefined);

    const provider = new BeatportDataProvider();

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toEqual([]);

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Cannot map Beatport search result track to TrackInfo',
      {
        trackId: validSearchResultTrack.track_id,
        trackName: validSearchResultTrack.track_name,
      },
    );
  });

  it('logs validation errors and skips candidates with invalid mapped TrackInfo', async () => {
    const invalidTrackInfo: TrackInfo = {
      title: 'Example Track',
      artists: ['Adam Beyer', 'adam beyer'],
    };

    mocks.fetchBeatportSearchTrackPayload.mockResolvedValueOnce([
      validSearchResultTrack,
    ]);

    vi.mocked(
      beatportMappers.mapBeatportSearchResultTrackToTrackInfo,
    ).mockReturnValueOnce(invalidTrackInfo);

    const provider = new BeatportDataProvider();

    const result = await provider.findTrackCandidates(inputKeywords);

    expect(result).toEqual([]);

    const logContext = getLoggedWarningContext(
      mocks.loggerWarn.mock.calls,
      'Cannot validate mapped TrackInfo from Beatport search result',
    );

    expect(logContext.trackId).toBe(validSearchResultTrack.track_id);
    expect(logContext.trackName).toBe(validSearchResultTrack.track_name);

    expect(getFirstLoggedIssue(logContext)).toMatchObject({
      code: 'custom',
      path: 'artists',
    });
  });

  it('returns undefined when the full track data cannot be mapped', async () => {
    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce(undefined);
    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce(undefined);

    vi.mocked(
      beatportMappers.mapBeatportTrackToTrackInfo,
    ).mockReturnValueOnce(undefined);

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toBeUndefined();

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('logs validation errors and returns undefined for invalid mapped track metadata', async () => {
    const invalidTrackInfo: TrackInfo = {
      title: 'Example Track',
      artists: ['Primary Artist', 'primary artist'],
    };

    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce(undefined);
    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce(undefined);

    vi.mocked(
      beatportMappers.mapBeatportTrackToTrackInfo,
    ).mockReturnValueOnce(invalidTrackInfo);

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toBeUndefined();

    const logContext = getLoggedWarningContext(
      mocks.loggerWarn.mock.calls,
      'Cannot validate normalized TrackInfo extracted from Beatport API',
    );

    expect(logContext.trackUrl).toBe(trackUrl.toString());

    expect(getFirstLoggedIssue(logContext)).toMatchObject({
      code: 'custom',
      path: 'artists',
    });
  });

  it('logs validation errors and omits invalid mapped album metadata', async () => {
    const invalidAlbumInfo: AlbumInfo = {
      title: 'Example Album',
      artists: ['Primary Artist', 'primary artist'],
    };

    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce({
      albumUrl: expectedAlbumUrl,
      albumData: validDetailedAlbumData,
    });

    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce(undefined);

    vi.mocked(
      beatportMappers.mapBeatportAlbumToAlbumInfo,
    ).mockReturnValueOnce(invalidAlbumInfo);

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toMatchObject({
      url: trackUrl,
      title: 'Example Track (Extended Mix)',
    });

    expect(result).not.toHaveProperty('album');

    const logContext = getLoggedWarningContext(
      mocks.loggerWarn.mock.calls,
      'Cannot validate normalized AlbumInfo extracted from Beatport API',
    );

    expect(logContext.albumUrl).toBe(expectedAlbumUrl.toString());

    expect(getFirstLoggedIssue(logContext)).toMatchObject({
      code: 'custom',
      path: 'artists',
    });
  });

  it('logs validation errors and omits invalid mapped publisher metadata', async () => {
    const invalidPublisherInfo: PublisherInfo = {
      name: '',
    };

    mocks.fetchBeatportTrackPayload.mockResolvedValueOnce(
      validDetailedTrackData,
    );

    mocks.fetchBeatportAlbumPayload.mockResolvedValueOnce({
      albumUrl: expectedAlbumUrl,
      albumData: validDetailedAlbumData,
    });

    mocks.fetchBeatportPublisherPayload.mockResolvedValueOnce({
      publisherUrl: expectedPublisherUrl,
      publisherData: validDetailedPublisherData,
    });

    vi.mocked(
      beatportMappers.mapBeatportPublisherToPublisherInfo,
    ).mockReturnValueOnce(invalidPublisherInfo);

    const provider = new BeatportDataProvider();

    const result = await provider.getTrackInfo(trackUrl);

    expect(result).toMatchObject({
      url: trackUrl,
      title: 'Example Track (Extended Mix)',
      album: expectedDetailedTrackInfo.album,
    });

    expect(result).not.toHaveProperty('publisher');

    const logContext = getLoggedWarningContext(
      mocks.loggerWarn.mock.calls,
      'Cannot validate normalized PublisherInfo extracted from Beatport API',
    );

    expect(logContext.publisherUrl).toBe(
      expectedPublisherUrl.toString(),
    );

    expect(getFirstLoggedIssue(logContext)).toMatchObject({
      code: 'too_small',
      path: 'name',
    });
  });
});
