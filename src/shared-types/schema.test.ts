import { describe, expect, it } from 'vitest';

import {
  albumInfoSchema,
  publisherInfoSchema,
  trackDetailsSchema,
  trackInfoSchema,
} from './schema.js';

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

describe('albumInfoSchema numeric fields', () => {
  it.each([
    { field: 'trackNumber', value: 1 },
    { field: 'trackTotal', value: 12 },
  ])('accepts a positive integer for "$field"', ({ field, value }) => {
    const input = {
      title: 'Album Name',
      [field]: value,
    };

    expect(albumInfoSchema.parse(input)).toEqual(input);
  });

  it.each(['trackNumber', 'trackTotal'] as const)(
    'rejects invalid values for "%s"',
    (field) => {
      for (const value of [
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        '12',
        null,
      ]) {
        expect(
          albumInfoSchema.safeParse({
            title: 'Album Name',
            [field]: value,
          }).success,
        ).toBe(false);
      }
    },
  );
});

describe('albumInfoSchema URL fields', () => {
  it.each(['url', 'artwork'] as const)(
    'accepts a URL instance in "%s"',
    (field) => {
      const url = new URL('https://example.com/album');
      const input = {
        title: 'Album Name',
        [field]: url,
      };

      const result = albumInfoSchema.parse(input);

      expect(result[field]).toBe(url);
    },
  );

  it.each(['url', 'artwork'] as const)(
    'rejects a string value in "%s"',
    (field) => {
      expect(
        albumInfoSchema.safeParse({
          title: 'Album Name',
          [field]: 'https://example.com/album',
        }).success,
      ).toBe(false);
    },
  );
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

describe('publisherInfoSchema URL fields', () => {
  it.each(['url', 'logotype'] as const)(
    'accepts a URL instance in "%s"',
    (field) => {
      const url = new URL('https://example.com/publisher');
      const input = {
        name: 'Publisher Name',
        [field]: url,
      };

      const result = publisherInfoSchema.parse(input);

      expect(result[field]).toBe(url);
    },
  );

  it.each(['url', 'logotype'] as const)(
    'rejects a string value in "%s"',
    (field) => {
      expect(
        publisherInfoSchema.safeParse({
          name: 'Publisher Name',
          [field]: 'https://example.com/publisher',
        }).success,
      ).toBe(false);
    },
  );
});

describe('trackDetailsSchema duration', () => {
  it('accepts a positive fractional duration', () => {
    expect(trackDetailsSchema.parse({ duration: 184.37 })).toEqual({
      duration: 184.37,
    });
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '184.37',
    null,
  ])('rejects an invalid duration (%j)', (duration) => {
    expect(trackDetailsSchema.safeParse({ duration }).success).toBe(false);
  });

  it('rejects a missing duration', () => {
    expect(trackDetailsSchema.safeParse({}).success).toBe(false);
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

describe('trackInfoSchema numeric fields', () => {
  it('accepts a positive integer year', () => {
    expect(trackInfoSchema.parse({ year: 2024 })).toEqual({
      year: 2024,
    });
  });

  it.each([
    0,
    -1,
    2024.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '2024',
    null,
  ])('rejects an invalid year (%j)', (year) => {
    expect(trackInfoSchema.safeParse({ year }).success).toBe(false);
  });

  it('accepts a positive fractional BPM', () => {
    expect(trackInfoSchema.parse({ bpm: 128.5 })).toEqual({
      bpm: 128.5,
    });
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '128',
    null,
  ])('rejects an invalid BPM (%j)', (bpm) => {
    expect(trackInfoSchema.safeParse({ bpm }).success).toBe(false);
  });
});

describe('trackInfoSchema key', () => {
  it.each([
    'C',
    'G#m',
    'Bb',
    'Cbm',
    'A#',
    'Fm',
  ])('accepts canonical track key "%s"', (key) => {
    expect(trackInfoSchema.parse({ key })).toEqual({ key });
  });

  it.each([
    'c',
    'g#m',
    'H',
    'C##',
    'Cbb',
    'C♭',
    'C major',
    '',
  ])('rejects a non-canonical track key "%s"', (key) => {
    expect(trackInfoSchema.safeParse({ key }).success).toBe(false);
  });

  it.each([
    42,
    true,
    null,
  ])('rejects a non-string track key (%j)', (key) => {
    expect(trackInfoSchema.safeParse({ key }).success).toBe(false);
  });
});

describe('trackInfoSchema URL fields', () => {
  it.each(['url', 'waveform'] as const)(
    'accepts a URL instance in "%s"',
    (field) => {
      const url = new URL('https://example.com/track');
      const input = {
        [field]: url,
      };

      const result = trackInfoSchema.parse(input);

      expect(result[field]).toBe(url);
    },
  );

  it.each(['url', 'waveform'] as const)(
    'rejects a string value in "%s"',
    (field) => {
      expect(
        trackInfoSchema.safeParse({
          [field]: 'https://example.com/track',
        }).success,
      ).toBe(false);
    },
  );
});

describe('strict object validation', () => {
  it.each([
    {
      description: 'albumInfoSchema',
      schema: albumInfoSchema,
      input: { title: 'Album Name', unexpected: true },
    },
    {
      description: 'publisherInfoSchema',
      schema: publisherInfoSchema,
      input: { name: 'Publisher Name', unexpected: true },
    },
    {
      description: 'trackDetailsSchema',
      schema: trackDetailsSchema,
      input: { duration: 180, unexpected: true },
    },
    {
      description: 'trackInfoSchema',
      schema: trackInfoSchema,
      input: { unexpected: true },
    },
  ])('rejects unknown root properties in $description', ({ schema, input }) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it.each([
    {
      description: 'album',
      input: {
        album: { title: 'Album Name', unexpected: true },
      },
    },
    {
      description: 'publisher',
      input: {
        publisher: { name: 'Publisher Name', unexpected: true },
      },
    },
    {
      description: 'details',
      input: {
        details: { duration: 180, unexpected: true },
      },
    },
  ])('rejects unknown properties in the nested $description object', ({ input }) => {
    expect(trackInfoSchema.safeParse(input).success).toBe(false);
  });

  it('accepts known properties in nested objects', () => {
    const input = {
      title: 'Track Name',
      album: {
        title: 'Album Name',
      },
      publisher: {
        name: 'Publisher Name',
      },
      details: {
        duration: 180,
      },
    };

    expect(trackInfoSchema.parse(input)).toEqual(input);
  });
});
