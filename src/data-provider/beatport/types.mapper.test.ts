import { describe, expect, it } from 'vitest';

import {
  mapBeatportAlbumToAlbumInfo,
  mapBeatportSearchResultTrackToTrackInfo,
} from './types.mapper.js';

import {
  BeatportArtistType,
} from './types.js';

import type {
  BeatportAlbumInfo,
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

const validAlbumUrl = new URL(
  'https://www.beatport.com/release/example-album/123456',
);

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

describe('mapBeatportAlbumToAlbumInfo', () => {
  it('maps a Beatport album to canonical AlbumInfo', () => {
    const result = mapBeatportAlbumToAlbumInfo(
      validAlbumData,
      validAlbumUrl,
      3,
    );

    expect(result).toEqual({
      title: 'Example Album',
      artists: [
        'Primary Artist',
        'Second Artist',
      ],
      catalogNumber: 'CAT-001',
      trackNumber: 3,
      trackTotal: 12,
      url: validAlbumUrl,
      artwork: new URL(
        'https://example.com/image/album.jpg',
      ),
    });
  });

  describe('artwork URL normalization', () => {
    it.each([
      {
        imageUrl: 'https://example.com/image_size/{w}x{h}/album.jpg',
        expectedUrl: 'https://example.com/image/album.jpg',
      },
      {
        imageUrl: 'https://example.com/image/album.jpg',
        expectedUrl: 'https://example.com/image/album.jpg',
      },
    ])(
      'maps artwork URL "$imageUrl" to "$expectedUrl"',
      ({ imageUrl, expectedUrl }) => {
        const albumData: BeatportAlbumInfo = {
          ...validAlbumData,
          image: {
            ...validAlbumData.image,
            uri: imageUrl,
          },
        };

        const result = mapBeatportAlbumToAlbumInfo(
          albumData,
          validAlbumUrl,
          3,
        );

        expect(result?.artwork).toEqual(new URL(expectedUrl));
      },
    );

    it('omits artwork when the image URL is invalid', () => {
      const albumData: BeatportAlbumInfo = {
        ...validAlbumData,
        image: {
          ...validAlbumData.image,
          uri: 'invalid-url',
        },
      };

      const result = mapBeatportAlbumToAlbumInfo(
        albumData,
        validAlbumUrl,
        3,
      );

      expect(result).not.toHaveProperty('artwork');
    });
  });

  describe('track number normalization', () => {
    it.each([0, -1, 1.5])(
      'omits an invalid track number: %s',
      (trackNumber) => {
        const result = mapBeatportAlbumToAlbumInfo(
          validAlbumData,
          validAlbumUrl,
          trackNumber,
        );

        expect(result).not.toHaveProperty('trackNumber');
      },
    );
  });

  it('omits track total when Beatport reports zero tracks', () => {
    const albumData: BeatportAlbumInfo = {
      ...validAlbumData,
      track_count: 0,
    };

    const result = mapBeatportAlbumToAlbumInfo(
      albumData,
      validAlbumUrl,
      3,
    );

    expect(result).not.toHaveProperty('trackTotal');
  });

  it('omits catalog number when Beatport does not provide it', () => {
    const albumData: BeatportAlbumInfo = {
      ...validAlbumData,
    };

    delete albumData.catalog_number;

    const result = mapBeatportAlbumToAlbumInfo(
      albumData,
      validAlbumUrl,
      3,
    );

    expect(result).not.toHaveProperty('catalogNumber');
  });

  it('returns undefined when the album title cannot be normalized', () => {
    const albumData: BeatportAlbumInfo = {
      ...validAlbumData,
      name: '   ',
    };

    const result = mapBeatportAlbumToAlbumInfo(
      albumData,
      validAlbumUrl,
      3,
    );

    expect(result).toBeUndefined();
  });
});
