import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataProvider } from '../index.js';

import { BeatportDataProvider } from './index.js';

import type {
  BeatportDataProviderOptions,
} from './index.js';

const mocks = vi.hoisted(() => ({
  fetchBeatportAlbumPayload: vi.fn(),
  fetchBeatportPublisherPayload: vi.fn(),
  fetchBeatportSearchTrackPayload: vi.fn(),
  fetchBeatportTrackPayload: vi.fn(),
}));

vi.mock('./beatport-data.js', () => ({
  fetchBeatportAlbumPayload: mocks.fetchBeatportAlbumPayload,
  fetchBeatportPublisherPayload: mocks.fetchBeatportPublisherPayload,
  fetchBeatportSearchTrackPayload: mocks.fetchBeatportSearchTrackPayload,
  fetchBeatportTrackPayload: mocks.fetchBeatportTrackPayload,
}));

const inputKeywords = ['Adam', 'Beyer'];

const defaultSearchUrl = new URL(
  'https://www.beatport.com/search/tracks',
);

const defaultSearchParameters = {
  per_page: '150',
};

describe('BeatportDataProvider', () => {
  beforeEach(() => {
    mocks.fetchBeatportAlbumPayload.mockReset();
    mocks.fetchBeatportPublisherPayload.mockReset();
    mocks.fetchBeatportSearchTrackPayload.mockReset();
    mocks.fetchBeatportTrackPayload.mockReset();
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
});
