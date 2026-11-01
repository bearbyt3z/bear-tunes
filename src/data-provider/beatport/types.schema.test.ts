import { describe, expect, it } from 'vitest';

import {
  beatportSearchResultArtistInfoSchema,
  beatportSearchResultGenreInfoSchema,
  beatportSearchResultLabelInfoSchema,
  beatportSearchResultReleaseInfoSchema,
  beatportSearchResultTrackInfoArraySchema,
  beatportSearchResultTrackInfoSchema,
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
          isrc: null,
          key_id: 0,
          key_name: 'C Minor',
          length: 184376,
          track_image_uri: 'https://example.com/track.jpg',
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
