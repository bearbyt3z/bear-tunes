import { describe, expect, it } from 'vitest';

import {
  albumInfoSchema,
  publisherInfoSchema,
  trackInfoSchema,
} from './schema.js';

describe('albumInfoSchema', () => {
  it('accepts a non-empty trimmed title without requiring optional fields', () => {
    const albumInfo = {
      title: 'Album Name',
    };

    expect(albumInfoSchema.parse(albumInfo)).toEqual(albumInfo);
  });

  it.each([
    '',
    '   ',
    '\t\n',
  ])('rejects an empty or whitespace-only title (%j)', (title) => {
    expect(albumInfoSchema.safeParse({ title }).success).toBe(false);
  });

  it.each([
    ' Album Name',
    'Album Name ',
    ' Album Name ',
  ])('rejects a title with leading or trailing whitespace (%j)', (title) => {
    expect(albumInfoSchema.safeParse({ title }).success).toBe(false);
  });

  it('accepts a canonical catalog number', () => {
    const albumInfo = {
      title: 'Album Name',
      catalogNumber: 'CAT-123',
    };

    expect(albumInfoSchema.parse(albumInfo)).toEqual(albumInfo);
  });

  it.each([
    '',
    '   ',
    '\t\n',
  ])('rejects an empty or whitespace-only catalog number (%j)', (catalogNumber) => {
    expect(
      albumInfoSchema.safeParse({
        title: 'Album Name',
        catalogNumber,
      }).success,
    ).toBe(false);
  });

  it.each([
    ' CAT-123',
    'CAT-123 ',
    ' CAT-123 ',
  ])('rejects a catalog number with surrounding whitespace (%j)', (catalogNumber) => {
    expect(
      albumInfoSchema.safeParse({
        title: 'Album Name',
        catalogNumber,
      }).success,
    ).toBe(false);
  });
});

describe('publisherInfoSchema', () => {
  it('accepts a non-empty trimmed name without requiring optional fields', () => {
    const publisherInfo = {
      name: 'Publisher Name',
    };

    expect(publisherInfoSchema.parse(publisherInfo)).toEqual(publisherInfo);
  });

  it.each([
    '',
    '   ',
    '\t\n',
  ])('rejects an empty or whitespace-only name (%j)', (name) => {
    expect(publisherInfoSchema.safeParse({ name }).success).toBe(false);
  });

  it.each([
    ' Publisher Name',
    'Publisher Name ',
    ' Publisher Name ',
  ])('rejects a name with leading or trailing whitespace (%j)', (name) => {
    expect(publisherInfoSchema.safeParse({ name }).success).toBe(false);
  });
});

describe('trackInfoSchema', () => {
  it('accepts a valid release date', () => {
    const released = new Date('2024-05-17T00:00:00.000Z');

    expect(trackInfoSchema.parse({ released })).toEqual({ released });
  });

  it('rejects an invalid Date instance', () => {
    const released = new Date(Number.NaN);

    expect(trackInfoSchema.safeParse({ released }).success).toBe(false);
  });

  it('rejects a string instead of a Date instance', () => {
    expect(
      trackInfoSchema.safeParse({ released: '2024-05-17' }).success,
    ).toBe(false);
  });

  it('allows optional fields to be omitted', () => {
    expect(trackInfoSchema.parse({})).toEqual({});
  });
});

const trackInfoTextFields = [
  'title',
  'genre',
  'subgenre',
  'isrc',
  'ufid',
] as const;

describe('trackInfoSchema optional text fields', () => {
  it.each(trackInfoTextFields)(
    'accepts a canonical value for "%s"',
    (field) => {
      const input = { [field]: 'Canonical Value' };

      expect(trackInfoSchema.parse(input)).toEqual(input);
    },
  );

  it.each(trackInfoTextFields)(
    'rejects empty or whitespace-only values for "%s"',
    (field) => {
      for (const value of ['', '   ', '\t\n']) {
        expect(
          trackInfoSchema.safeParse({ [field]: value }).success,
        ).toBe(false);
      }
    },
  );

  it.each(trackInfoTextFields)(
    'rejects leading or trailing whitespace in "%s"',
    (field) => {
      for (const value of [' Value', 'Value ', ' Value ']) {
        expect(
          trackInfoSchema.safeParse({ [field]: value }).success,
        ).toBe(false);
      }
    },
  );

  it('allows all optional text fields to be omitted', () => {
    expect(trackInfoSchema.parse({})).toEqual({});
  });
});

const invalidArtistArrays = [
  {
    description: 'an empty array',
    value: [],
  },
  {
    description: 'an empty artist name',
    value: [''],
  },
  {
    description: 'a whitespace-only artist name',
    value: ['   '],
  },
  {
    description: 'an artist name with leading whitespace',
    value: [' Artist A'],
  },
  {
    description: 'an artist name with trailing whitespace',
    value: ['Artist A '],
  },
  {
    description: 'duplicate artist names ignoring case',
    value: ['Artist A', 'artist a'],
  },
];

describe('albumInfoSchema artists', () => {
  it('accepts a non-empty array of canonical artist names', () => {
    const albumInfo = {
      title: 'Album Name',
      artists: ['Artist A', 'Artist B'],
    };

    expect(albumInfoSchema.parse(albumInfo)).toEqual(albumInfo);
  });

  it.each(invalidArtistArrays)(
    'rejects $description',
    ({ value }) => {
      expect(
        albumInfoSchema.safeParse({
          title: 'Album Name',
          artists: value,
        }).success,
      ).toBe(false);
    },
  );

  it('allows the artists field to be omitted', () => {
    expect(albumInfoSchema.parse({ title: 'Album Name' })).toEqual({
      title: 'Album Name',
    });
  });
});

describe('trackInfoSchema artist arrays', () => {
  it.each(['artists', 'remixers'] as const)(
    'accepts a non-empty array of canonical names in "%s"',
    (field) => {
      const input = {
        [field]: ['Artist A', 'Artist B'],
      };

      expect(trackInfoSchema.parse(input)).toEqual(input);
    },
  );

  it.each(['artists', 'remixers'] as const)(
    'rejects invalid arrays in "%s"',
    (field) => {
      for (const { value } of invalidArtistArrays) {
        expect(
          trackInfoSchema.safeParse({
            [field]: value,
          }).success,
        ).toBe(false);
      }
    },
  );

  it('allows both artist arrays to be omitted', () => {
    expect(trackInfoSchema.parse({})).toEqual({});
  });
});
