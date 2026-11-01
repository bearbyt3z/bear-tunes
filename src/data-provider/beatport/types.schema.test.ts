import { describe, expect, it } from 'vitest';

import {
  beatportAlbumInfoSchema,
  beatportArtistWithRoleInfoSchema,
  beatportGenreInfoSchema,
  beatportLabelInfoSchema,
  beatportPublisherInfoSchema,
  beatportReleaseInfoSchema,
  beatportSearchResultArtistInfoSchema,
  beatportSearchResultGenreInfoSchema,
  beatportSearchResultLabelInfoSchema,
  beatportSearchResultReleaseInfoSchema,
  beatportSearchResultTrackInfoArraySchema,
  beatportSearchResultTrackInfoSchema,
  beatportSubGenreInfoSchema,
  beatportTrackInfoSchema,
} from './types.schema.js';

import {
  BeatportArtistType,
} from './types.js';

const validSearchResultArtist = {
  artist_id: 0,
  artist_name: 'Example Artist',
  artist_type_name: BeatportArtistType.Artist,
};

const validSearchResultLabel = {
  label_id: 0,
  label_name: 'Example Label',
};

const validSearchResultRelease = {
  release_id: 0,
  release_name: 'Example Release',
};

const validSearchResultGenre = {
  genre_id: 0,
  genre_name: 'House',
};

const validSearchResultTrack = {
  score: 1.5,
  artists: [validSearchResultArtist],
  label: validSearchResultLabel,
  mix_name: 'Original Mix',
  release: validSearchResultRelease,
  release_date: '2025-01-01',
  track_id: 0,
  track_name: 'Example Track',
  track_number: 0,
  genre: [validSearchResultGenre],
};

const validDetailedTrackArtist = {
  id: 0,
  name: 'Example Artist',
  type: BeatportArtistType.Artist,
};

const validDetailedTrackSubGenre = {
  id: 0,
  name: 'Tech House',
};

const validDetailedTrackGenre = {
  id: 0,
  name: 'House',
  sub_genre: validDetailedTrackSubGenre,
};

const validDetailedTrackRelease = {
  id: 0,
  name: 'Example Release',
  image_url: 'https://example.com/release.jpg',
  release_date: '2025-01-01',
  slug: 'example-release',
};

const validDetailedTrackLabel = {
  id: 0,
  name: 'Example Label',
  slug: 'example-label',
};

const validDetailedTrack = {
  artists: [validDetailedTrackArtist],
  genre: validDetailedTrackGenre,
  track_id: 0,
  track_waveform_url: 'https://example.com/waveform',
  key: 'C Minor',
  track_length_ms: 0,
  mix_name: 'Extended Mix',
  track_name: 'Example Track',
  track_number: 0,
  release: validDetailedTrackRelease,
  label: validDetailedTrackLabel,
};

const validAlbumArtist = {
  id: 0,
  name: 'Example Artist',
};

const validAlbumImage = {
  id: 0,
  uri: 'https://example.com/album.jpg',
};

const validAlbum = {
  artists: [validAlbumArtist],
  bpm_range: {
    min: 0,
    max: 0,
  },
  id: 0,
  image: validAlbumImage,
  label: validDetailedTrackLabel,
  name: 'Example Album',
  new_release_date: '2025-01-01',
  remixers: [validAlbumArtist],
  slug: 'example-album',
  tracks: [
    'https://www.beatport.com/track/example-track/123456',
  ],
  track_count: 0,
};

const validPublisher = {
  id: 0,
  image_url: null,
  name: 'Example Publisher',
  slug: 'example-publisher',
};

describe('Beatport search result schemas', () => {
  describe('beatportSearchResultArtistInfoSchema', () => {
    it('accepts a valid artist with zero identifier', () => {
      expect(
        beatportSearchResultArtistInfoSchema.safeParse(
          validSearchResultArtist,
        ).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid artist identifier: %s',
      (artistId) => {
        expect(
          beatportSearchResultArtistInfoSchema.safeParse({
            ...validSearchResultArtist,
            artist_id: artistId,
          }).success,
        ).toBe(false);
      },
    );

    it.each(Object.values(BeatportArtistType))(
      'accepts the artist role "%s"',
      (artistType) => {
        expect(
          beatportSearchResultArtistInfoSchema.safeParse({
            ...validSearchResultArtist,
            artist_type_name: artistType,
          }).success,
        ).toBe(true);
      },
    );

    it('rejects an unsupported artist role', () => {
      expect(
        beatportSearchResultArtistInfoSchema.safeParse({
          ...validSearchResultArtist,
          artist_type_name: 'Unknown',
        }).success,
      ).toBe(false);
    });
  });

  describe('beatportSearchResultLabelInfoSchema', () => {
    it('accepts a valid label with zero identifier', () => {
      expect(
        beatportSearchResultLabelInfoSchema.safeParse(
          validSearchResultLabel,
        ).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid label identifier: %s',
      (labelId) => {
        expect(
          beatportSearchResultLabelInfoSchema.safeParse({
            ...validSearchResultLabel,
            label_id: labelId,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('beatportSearchResultReleaseInfoSchema', () => {
    it('accepts a valid release with zero identifier', () => {
      expect(
        beatportSearchResultReleaseInfoSchema.safeParse(
          validSearchResultRelease,
        ).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid release identifier: %s',
      (releaseId) => {
        expect(
          beatportSearchResultReleaseInfoSchema.safeParse({
            ...validSearchResultRelease,
            release_id: releaseId,
          }).success,
        ).toBe(false);
      },
    );

    it('accepts an optional release image URL', () => {
      expect(
        beatportSearchResultReleaseInfoSchema.safeParse({
          ...validSearchResultRelease,
          release_image_url: 'https://example.com/release.jpg',
        }).success,
      ).toBe(true);
    });
  });

  describe('beatportSearchResultGenreInfoSchema', () => {
    it('accepts a valid genre with zero identifier', () => {
      expect(
        beatportSearchResultGenreInfoSchema.safeParse(
          validSearchResultGenre,
        ).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid genre identifier: %s',
      (genreId) => {
        expect(
          beatportSearchResultGenreInfoSchema.safeParse({
            ...validSearchResultGenre,
            genre_id: genreId,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('beatportSearchResultTrackInfoSchema', () => {
    it('accepts a valid track with optional fields omitted', () => {
      expect(
        beatportSearchResultTrackInfoSchema.safeParse(
          validSearchResultTrack,
        ).success,
      ).toBe(true);
    });

    it('accepts optional fields with valid values', () => {
      expect(
        beatportSearchResultTrackInfoSchema.safeParse({
          ...validSearchResultTrack,
          bpm: 128.5,
          catalog_number: 'CAT-001',
          isrc: 'USRC17607839',
          key_id: 0,
          key_name: 'C Minor',
          length: 184376,
          track_image_uri: 'https://example.com/track.jpg',
        }).success,
      ).toBe(true);
    });

    it('accepts a null ISRC', () => {
      expect(
        beatportSearchResultTrackInfoSchema.safeParse({
          ...validSearchResultTrack,
          isrc: null,
        }).success,
      ).toBe(true);
    });

    it.each([0, 128.5])(
      'accepts BPM value %s',
      (bpm) => {
        expect(
          beatportSearchResultTrackInfoSchema.safeParse({
            ...validSearchResultTrack,
            bpm,
          }).success,
        ).toBe(true);
      },
    );

    it('rejects a negative BPM value', () => {
      expect(
        beatportSearchResultTrackInfoSchema.safeParse({
          ...validSearchResultTrack,
          bpm: -1,
        }).success,
      ).toBe(false);
    });

    it.each([
      ['key_id', -1],
      ['key_id', 1.5],
      ['length', -1],
      ['length', 1.5],
      ['track_id', -1],
      ['track_id', 1.5],
      ['track_number', -1],
      ['track_number', 1.5],
    ])(
      'rejects an invalid %s value: %s',
      (field, value) => {
        expect(
          beatportSearchResultTrackInfoSchema.safeParse({
            ...validSearchResultTrack,
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('beatportSearchResultTrackInfoArraySchema', () => {
    it('accepts an empty array', () => {
      expect(
        beatportSearchResultTrackInfoArraySchema.safeParse([]).success,
      ).toBe(true);
    });

    it('accepts an array containing valid tracks', () => {
      expect(
        beatportSearchResultTrackInfoArraySchema.safeParse([
          validSearchResultTrack,
          validSearchResultTrack,
        ]).success,
      ).toBe(true);
    });

    it('rejects an array containing an invalid track', () => {
      expect(
        beatportSearchResultTrackInfoArraySchema.safeParse([
          validSearchResultTrack,
          {
            ...validSearchResultTrack,
            track_id: -1,
          },
        ]).success,
      ).toBe(false);
    });
  });
});

describe('Beatport detailed track schemas', () => {
  describe('beatportArtistWithRoleInfoSchema', () => {
    it('accepts a valid artist with zero identifier', () => {
      expect(
        beatportArtistWithRoleInfoSchema.safeParse(
          validDetailedTrackArtist,
        ).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid artist identifier: %s',
      (artistId) => {
        expect(
          beatportArtistWithRoleInfoSchema.safeParse({
            ...validDetailedTrackArtist,
            id: artistId,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('beatportGenreInfoSchema', () => {
    it('accepts a valid genre with zero identifier', () => {
      expect(
        beatportGenreInfoSchema.safeParse(
          validDetailedTrackGenre,
        ).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid genre identifier: %s',
      (genreId) => {
        expect(
          beatportGenreInfoSchema.safeParse({
            ...validDetailedTrackGenre,
            id: genreId,
          }).success,
        ).toBe(false);
      },
    );

    it('accepts a null subgenre object', () => {
      expect(
        beatportGenreInfoSchema.safeParse({
          ...validDetailedTrackGenre,
          sub_genre: null,
        }).success,
      ).toBe(true);
    });
  });

  describe('beatportSubGenreInfoSchema', () => {
    it('accepts a valid subgenre with zero identifier', () => {
      expect(
        beatportSubGenreInfoSchema.safeParse(
          validDetailedTrackSubGenre,
        ).success,
      ).toBe(true);
    });

    it.each([
      { id: null, name: 'Tech House' },
      { id: 0, name: null },
      { id: null, name: null },
    ])('accepts nullable subgenre properties: %o', (subGenre) => {
      expect(
        beatportSubGenreInfoSchema.safeParse(subGenre).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid subgenre identifier: %s',
      (subGenreId) => {
        expect(
          beatportSubGenreInfoSchema.safeParse({
            ...validDetailedTrackSubGenre,
            id: subGenreId,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('beatportReleaseInfoSchema', () => {
    it('accepts a valid release with zero identifier', () => {
      expect(
        beatportReleaseInfoSchema.safeParse(
          validDetailedTrackRelease,
        ).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid release identifier: %s',
      (releaseId) => {
        expect(
          beatportReleaseInfoSchema.safeParse({
            ...validDetailedTrackRelease,
            id: releaseId,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('beatportLabelInfoSchema', () => {
    it('accepts a valid label with zero identifier', () => {
      expect(
        beatportLabelInfoSchema.safeParse(
          validDetailedTrackLabel,
        ).success,
      ).toBe(true);
    });

    it.each([-1, 1.5])(
      'rejects an invalid label identifier: %s',
      (labelId) => {
        expect(
          beatportLabelInfoSchema.safeParse({
            ...validDetailedTrackLabel,
            id: labelId,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('beatportTrackInfoSchema', () => {
    it('accepts a valid detailed track with zero numeric values', () => {
      expect(
        beatportTrackInfoSchema.safeParse(
          validDetailedTrack,
        ).success,
      ).toBe(true);
    });

    it('accepts an optional catalog number', () => {
      expect(
        beatportTrackInfoSchema.safeParse({
          ...validDetailedTrack,
          catalog_number: 'CAT-001',
        }).success,
      ).toBe(true);
    });

    it.each(['USRC17607839', null])(
      'accepts ISRC value %s',
      (isrc) => {
        expect(
          beatportTrackInfoSchema.safeParse({
            ...validDetailedTrack,
            isrc,
          }).success,
        ).toBe(true);
      },
    );

    it.each([
      ['track_id', -1],
      ['track_id', 1.5],
      ['track_length_ms', -1],
      ['track_length_ms', 1.5],
      ['track_number', -1],
      ['track_number', 1.5],
    ])(
      'rejects an invalid %s value: %s',
      (field, value) => {
        expect(
          beatportTrackInfoSchema.safeParse({
            ...validDetailedTrack,
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );

    it.each([0, 128.5])(
      'accepts BPM value %s',
      (bpm) => {
        expect(
          beatportTrackInfoSchema.safeParse({
            ...validDetailedTrack,
            bpm,
          }).success,
        ).toBe(true);
      },
    );

    it('rejects a negative BPM value', () => {
      expect(
        beatportTrackInfoSchema.safeParse({
          ...validDetailedTrack,
          bpm: -1,
        }).success,
      ).toBe(false);
    });
  });
});

describe('beatportAlbumInfoSchema', () => {
  it('accepts a valid album with zero numeric values', () => {
    expect(
      beatportAlbumInfoSchema.safeParse(validAlbum).success,
    ).toBe(true);
  });

  it('accepts an optional catalog number', () => {
    expect(
      beatportAlbumInfoSchema.safeParse({
        ...validAlbum,
        catalog_number: 'CAT-001',
      }).success,
    ).toBe(true);
  });

  it('accepts fractional BPM range values', () => {
    expect(
      beatportAlbumInfoSchema.safeParse({
        ...validAlbum,
        bpm_range: {
          min: 120.5,
          max: 130.75,
        },
      }).success,
    ).toBe(true);
  });

  describe('numeric identifiers and counts', () => {
    it.each([-1, 1.5])(
      'rejects an invalid artist identifier: %s',
      (id) => {
        expect(
          beatportAlbumInfoSchema.safeParse({
            ...validAlbum,
            artists: [{ ...validAlbumArtist, id }],
          }).success,
        ).toBe(false);
      },
    );

    it.each([-1, 1.5])(
      'rejects an invalid remixer identifier: %s',
      (id) => {
        expect(
          beatportAlbumInfoSchema.safeParse({
            ...validAlbum,
            remixers: [{ ...validAlbumArtist, id }],
          }).success,
        ).toBe(false);
      },
    );

    it.each([-1, 1.5])(
      'rejects an invalid image identifier: %s',
      (id) => {
        expect(
          beatportAlbumInfoSchema.safeParse({
            ...validAlbum,
            image: {
              ...validAlbumImage,
              id,
            },
          }).success,
        ).toBe(false);
      },
    );

    it.each([-1, 1.5])(
      'rejects an invalid label identifier: %s',
      (id) => {
        expect(
          beatportAlbumInfoSchema.safeParse({
            ...validAlbum,
            label: {
              ...validDetailedTrackLabel,
              id,
            },
          }).success,
        ).toBe(false);
      },
    );

    it.each([-1, 1.5])(
      'rejects an invalid album identifier: %s',
      (id) => {
        expect(
          beatportAlbumInfoSchema.safeParse({
            ...validAlbum,
            id,
          }).success,
        ).toBe(false);
      },
    );

    it.each([-1, 1.5])(
      'rejects an invalid track count: %s',
      (trackCount) => {
        expect(
          beatportAlbumInfoSchema.safeParse({
            ...validAlbum,
            track_count: trackCount,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('BPM range', () => {
    it.each([
      ['min', -1],
      ['max', -1],
    ] as const)(
      'rejects a negative BPM range value for "%s"',
      (bound, value) => {
        expect(
          beatportAlbumInfoSchema.safeParse({
            ...validAlbum,
            bpm_range: {
              ...validAlbum.bpm_range,
              [bound]: value,
            },
          }).success,
        ).toBe(false);
      },
    );
  });
});

describe('beatportPublisherInfoSchema', () => {
  it('accepts a valid publisher with zero identifier and null image URL', () => {
    expect(
      beatportPublisherInfoSchema.safeParse(validPublisher).success,
    ).toBe(true);
  });

  it('accepts a publisher with a non-null image URL', () => {
    expect(
      beatportPublisherInfoSchema.safeParse({
        ...validPublisher,
        image_url: 'https://example.com/publisher.jpg',
      }).success,
    ).toBe(true);
  });

  it.each([-1, 1.5])(
    'rejects an invalid publisher identifier: %s',
    (id) => {
      expect(
        beatportPublisherInfoSchema.safeParse({
          ...validPublisher,
          id,
        }).success,
      ).toBe(false);
    },
  );

  it('rejects a publisher with a missing image URL', () => {
    const publisherWithoutImageUrl = {
      id: validPublisher.id,
      name: validPublisher.name,
      slug: validPublisher.slug,
    };

    expect(
      beatportPublisherInfoSchema.safeParse(
        publisherWithoutImageUrl,
      ).success,
    ).toBe(false);
  });
});
