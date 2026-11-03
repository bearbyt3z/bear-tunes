import { describe, expect, it } from 'vitest';

import {
  mapBeatportAlbumToAlbumInfo,
  mapBeatportPublisherToPublisherInfo,
  mapBeatportSearchResultTrackToTrackInfo,
  mapBeatportTrackToTrackInfo,
} from './types.mapper.js';

import {
  BeatportArtistType,
} from './types.js';

import type {
  BeatportAlbumInfo,
  BeatportPublisherInfo,
  BeatportSearchResultTrackInfo,
  BeatportTrackInfo,
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

const validPublisherData: BeatportPublisherInfo = {
  id: 401,
  image_url: 'https://example.com/image_size/1400x1400/publisher.jpg',
  name: ' Example Publisher ',
  slug: 'example-publisher',
};

const validPublisherUrl = new URL(
  'https://www.beatport.com/label/example-publisher/401',
);

const validDetailedTrackData: BeatportTrackInfo = {
  artists: [
    {
      id: 101,
      name: 'Primary Artist',
      type: BeatportArtistType.Artist,
    },
    {
      id: 102,
      name: 'Main Remixer',
      type: BeatportArtistType.Remixer,
    },
    {
      id: 103,
      name: 'Beatsource Remixer',
      type: BeatportArtistType.Beatsource_Remixer,
    },
    {
      id: 104,
      name: 'Producer',
      type: BeatportArtistType.Producer,
    },
    {
      id: 105,
      name: 'DJ',
      type: BeatportArtistType.DJ,
    },
  ],
  genre: {
    id: 201,
    name: 'House',
    sub_genre: {
      id: 202,
      name: 'Tech House',
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

const validDetailedTrackUrl = new URL(
  'https://www.beatport.com/track/example-track/123456',
);

const validCanonicalAlbumInfo = {
  title: 'Example Album',
  artists: ['Album Artist'],
  catalogNumber: 'CAT-001',
  trackNumber: 3,
  trackTotal: 12,
  url: new URL('https://www.beatport.com/release/example-album/123456'),
  artwork: new URL('https://example.com/image/album.jpg'),
};

const validCanonicalPublisherInfo = {
  name: 'Example Publisher',
  url: new URL('https://www.beatport.com/label/example-publisher/401'),
  logotype: new URL('https://example.com/image/publisher.jpg'),
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

describe('mapBeatportPublisherToPublisherInfo', () => {
  it('maps a Beatport publisher to canonical PublisherInfo', () => {
    const result = mapBeatportPublisherToPublisherInfo(
      validPublisherData,
      validPublisherUrl,
    );

    expect(result).toEqual({
      name: 'Example Publisher',
      url: validPublisherUrl,
      logotype: new URL(
        'https://example.com/image/publisher.jpg',
      ),
    });
  });

  it('omits logotype when Beatport image URL is null', () => {
    const publisherData: BeatportPublisherInfo = {
      ...validPublisherData,
      image_url: null,
    };

    const result = mapBeatportPublisherToPublisherInfo(
      publisherData,
      validPublisherUrl,
    );

    expect(result).toEqual({
      name: 'Example Publisher',
      url: validPublisherUrl,
    });

    expect(result).not.toHaveProperty('logotype');
  });

  it('preserves an image URL without a size transform', () => {
    const publisherData: BeatportPublisherInfo = {
      ...validPublisherData,
      image_url: 'https://example.com/image/publisher.jpg',
    };

    const result = mapBeatportPublisherToPublisherInfo(
      publisherData,
      validPublisherUrl,
    );

    expect(result?.logotype).toEqual(
      new URL('https://example.com/image/publisher.jpg'),
    );
  });

  it('omits logotype when the image URL is invalid', () => {
    const publisherData: BeatportPublisherInfo = {
      ...validPublisherData,
      image_url: 'invalid-url',
    };

    const result = mapBeatportPublisherToPublisherInfo(
      publisherData,
      validPublisherUrl,
    );

    expect(result).toEqual({
      name: 'Example Publisher',
      url: validPublisherUrl,
    });

    expect(result).not.toHaveProperty('logotype');
  });

  it('returns undefined when the publisher name cannot be normalized', () => {
    const publisherData: BeatportPublisherInfo = {
      ...validPublisherData,
      name: '   ',
    };

    const result = mapBeatportPublisherToPublisherInfo(
      publisherData,
      validPublisherUrl,
    );

    expect(result).toBeUndefined();
  });
});

describe('mapBeatportTrackToTrackInfo', () => {
  it('maps a detailed Beatport track to canonical TrackInfo', () => {
    const result = mapBeatportTrackToTrackInfo(
      validDetailedTrackData,
      validDetailedTrackUrl,
      validCanonicalAlbumInfo,
      validCanonicalPublisherInfo,
    );

    expect(result).toEqual({
      url: validDetailedTrackUrl,
      artists: ['Primary Artist'],
      title: 'Example Track (Extended Mix)',
      remixers: [
        'Main Remixer',
        'Beatsource Remixer',
      ],
      released: new Date('2025-01-15T00:00:00.000Z'),
      year: 2025,
      genre: 'House',
      subgenre: 'Tech House',
      bpm: 128.5,
      key: 'Cm',
      isrc: 'USRC17607839',
      ufid: 'track-123456',
      waveform: new URL('https://example.com/image/waveform.png'),
      album: validCanonicalAlbumInfo,
      publisher: validCanonicalPublisherInfo,
      details: {
        durationMs: 184376,
      },
    });
  });

  describe('artist role mapping', () => {
    it('preserves artist order and ignores unsupported roles', () => {
      const trackData: BeatportTrackInfo = {
        ...validDetailedTrackData,
        artists: [
          {
            id: 102,
            name: 'First Remixer',
            type: BeatportArtistType.Remixer,
          },
          {
            id: 101,
            name: 'Primary Artist',
            type: BeatportArtistType.Artist,
          },
          {
            id: 104,
            name: 'Producer',
            type: BeatportArtistType.Producer,
          },
          {
            id: 103,
            name: 'Second Remixer',
            type: BeatportArtistType.Beatsource_Remixer,
          },
        ],
      };

      const result = mapBeatportTrackToTrackInfo(
        trackData,
        validDetailedTrackUrl,
        undefined,
        undefined,
      );

      expect(result?.artists).toEqual(['Primary Artist']);
      expect(result?.remixers).toEqual([
        'First Remixer',
        'Second Remixer',
      ]);
    });
  });

  describe('subgenre mapping', () => {
    it.each([
      null,
      { id: null, name: null },
      { id: 202, name: null },
    ] as const)(
      'omits subgenre when Beatport does not provide a subgenre name: %o',
      (subGenre) => {
        const trackData: BeatportTrackInfo = {
          ...validDetailedTrackData,
          genre: {
            ...validDetailedTrackData.genre,
            sub_genre: subGenre,
          },
        };

        const result = mapBeatportTrackToTrackInfo(
          trackData,
          validDetailedTrackUrl,
          undefined,
          undefined,
        );

        expect(result).toHaveProperty('genre', 'House');
        expect(result).not.toHaveProperty('subgenre');
      },
    );
  });

  describe('waveform URL normalization', () => {
    it.each([
      {
        waveformUrl: 'https://example.com/image_size/{w}x{h}/waveform.png',
        expectedUrl: 'https://example.com/image/waveform.png',
      },
      {
        waveformUrl: 'https://example.com/image/waveform.png',
        expectedUrl: 'https://example.com/image/waveform.png',
      },
    ])(
      'maps waveform URL "$waveformUrl" to "$expectedUrl"',
      ({ waveformUrl, expectedUrl }) => {
        const trackData: BeatportTrackInfo = {
          ...validDetailedTrackData,
          track_waveform_url: waveformUrl,
        };

        const result = mapBeatportTrackToTrackInfo(
          trackData,
          validDetailedTrackUrl,
          undefined,
          undefined,
        );

        expect(result?.waveform).toEqual(new URL(expectedUrl));
      },
    );

    it('omits waveform when the URL is invalid', () => {
      const trackData: BeatportTrackInfo = {
        ...validDetailedTrackData,
        track_waveform_url: 'invalid-url',
      };

      const result = mapBeatportTrackToTrackInfo(
        trackData,
        validDetailedTrackUrl,
        undefined,
        undefined,
      );

      expect(result).not.toHaveProperty('waveform');
    });
  });

  describe('optional metadata', () => {
    it('omits unavailable BPM, ISRC, album, and publisher information', () => {
      const result = mapBeatportTrackToTrackInfo(
        {
          ...validDetailedTrackData,
          bpm: undefined,
          isrc: undefined,
        },
        validDetailedTrackUrl,
        undefined,
        undefined,
      );

      expect(result).not.toHaveProperty('bpm');
      expect(result).not.toHaveProperty('isrc');
      expect(result).not.toHaveProperty('album');
      expect(result).not.toHaveProperty('publisher');
    });

    it('omits ISRC when Beatport provides null', () => {
      const trackData: BeatportTrackInfo = {
        ...validDetailedTrackData,
        isrc: null,
      };

      const result = mapBeatportTrackToTrackInfo(
        trackData,
        validDetailedTrackUrl,
        undefined,
        undefined,
      );

      expect(result).not.toHaveProperty('isrc');
    });
  });

  describe('duration mapping', () => {
    it('omits track details when Beatport reports zero duration', () => {
      const trackData: BeatportTrackInfo = {
        ...validDetailedTrackData,
        track_length_ms: 0,
      };

      const result = mapBeatportTrackToTrackInfo(
        trackData,
        validDetailedTrackUrl,
        undefined,
        undefined,
      );

      expect(result).not.toHaveProperty('details');
    });
  });
});
