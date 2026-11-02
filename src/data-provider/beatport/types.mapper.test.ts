import { describe, expect, it } from 'vitest';

import {
  mapBeatportSearchResultTrackToTrackInfo,
} from './types.mapper.js';

import {
  BeatportArtistType,
} from './types.js';

import type {
  BeatportSearchResultTrackInfo,
} from './types.js';

const validSearchResultTrack: BeatportSearchResultTrackInfo = {
  score: 1,
  artists: [
    {
      artist_id: 101,
      artist_name: 'Primary Artist',
      artist_type_name: BeatportArtistType.Artist,
    },
  ],
  label: {
    label_id: 201,
    label_name: 'Example Label',
  },
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

describe('mapBeatportSearchResultTrackToTrackInfo', () => {
  it('maps a Beatport search result to canonical TrackInfo', () => {
    const trackEntry: BeatportSearchResultTrackInfo = {
      ...validSearchResultTrack,
      artists: [
        {
          artist_id: 101,
          artist_name: 'Primary Artist',
          artist_type_name: BeatportArtistType.Artist,
        },
        {
          artist_id: 102,
          artist_name: 'Main Remixer',
          artist_type_name: BeatportArtistType.Remixer,
        },
        {
          artist_id: 103,
          artist_name: 'Beatsource Remixer',
          artist_type_name: BeatportArtistType.Beatsource_Remixer,
        },
        {
          artist_id: 104,
          artist_name: 'Producer',
          artist_type_name: BeatportArtistType.Producer,
        },
        {
          artist_id: 105,
          artist_name: 'DJ',
          artist_type_name: BeatportArtistType.DJ,
        },
      ],
      bpm: 128.5,
      isrc: 'USRC17607839',
      length: 184376,
    };

    const result = mapBeatportSearchResultTrackToTrackInfo(
      trackEntry,
      'https://www.beatport.com',
    );

    expect(result).toEqual({
      url: new URL(
        'https://www.beatport.com/track/example-track/123456',
      ),
      artists: ['Primary Artist'],
      title: 'Example Track (Extended Mix)',
      remixers: [
        'Main Remixer',
        'Beatsource Remixer',
      ],
      released: new Date('2025-01-15T00:00:00.000Z'),
      year: 2025,
      genre: 'House',
      bpm: 128.5,
      isrc: 'USRC17607839',
      details: {
        durationMs: 184376,
      },
    });
  });

  it('maps the first two genre entries and ignores further entries', () => {
    const result = mapBeatportSearchResultTrackToTrackInfo(
      {
        ...validSearchResultTrack,
        genre: [
          {
            genre_id: 401,
            genre_name: 'Trance (Raw / Deep / Hypnotic)',
          },
          {
            genre_id: 402,
            genre_name: 'Deep Trance',
          },
          {
            genre_id: 403,
            genre_name: 'Additional Genre',
          },
        ],
      },
      'https://www.beatport.com',
    );

    expect(result).toMatchObject({
      genre: 'Trance (Raw / Deep / Hypnotic)',
      subgenre: 'Deep Trance',
    });

    expect(result).not.toHaveProperty('genre', 'Additional Genre');
    expect(result).not.toHaveProperty('subgenre', 'Additional Genre');
  });

  it('omits subgenre when only the main genre is provided', () => {
    const result = mapBeatportSearchResultTrackToTrackInfo(
      validSearchResultTrack,
      'https://www.beatport.com',
    );

    expect(result).toHaveProperty('genre', 'House');
    expect(result).not.toHaveProperty('subgenre');
  });

  it('omits genre information when no genre entries are provided', () => {
    const result = mapBeatportSearchResultTrackToTrackInfo(
      {
        ...validSearchResultTrack,
        genre: [],
      },
      'https://www.beatport.com',
    );

    expect(result).not.toHaveProperty('genre');
    expect(result).not.toHaveProperty('subgenre');
  });

  it('omits track details when Beatport does not provide track length', () => {
    const result = mapBeatportSearchResultTrackToTrackInfo(
      validSearchResultTrack,
      'https://www.beatport.com',
    );

    expect(result).not.toHaveProperty('details');
  });
});
