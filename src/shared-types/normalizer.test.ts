import { describe, expect, it } from 'vitest';

import {
  normalizeAlbumInfo,
  normalizePublisherInfo,
  normalizeTrackDetails,
  normalizeTrackInfo,
} from './normalizer.js';

describe('normalizeAlbumInfo', () => {
  it.each([
    null,
    undefined,
    'Album Name',
    42,
    true,
    [],
    new Date(),
  ])('returns undefined for non-record input (%j)', (album) => {
    expect(normalizeAlbumInfo(album)).toBeUndefined();
  });

  it('returns undefined when the title is missing', () => {
    expect(normalizeAlbumInfo({})).toBeUndefined();
  });

  it.each([
    null,
    42,
    '',
    '   ',
    '\t\n',
  ])('returns undefined when the title is invalid (%j)', (title) => {
    expect(normalizeAlbumInfo({ title })).toBeUndefined();
  });

  it('trims the title and normalizes supported typographic characters', () => {
    const result = normalizeAlbumInfo({
      title: '  Album — ‘Edition’  ',
    });

    expect(result).toEqual({
      title: "Album - 'Edition'",
    });
  });

  describe('artists', () => {
    it('normalizes an artist array', () => {
      const result = normalizeAlbumInfo({
        title: 'Album Name',
        artists: [
          ' Artist A ',
          '',
          42,
          'Artist B',
          'artist a',
          'Artist A, Artist B',
        ],
      });

      expect(result?.artists).toEqual(['Artist A', 'Artist B']);
    });

    it('normalizes a comma-separated artist string', () => {
      const result = normalizeAlbumInfo({
        title: 'Album Name',
        artists: 'Artist A, Artist B',
      });

      expect(result?.artists).toEqual(['Artist A', 'Artist B']);
    });
  });

  it('trims the catalog number and normalizes track numbers', () => {
    const result = normalizeAlbumInfo({
      title: 'Album Name',
      catalogNumber: ' CAT-123 ',
      trackNumber: '2',
      trackTotal: 12,
    });

    expect(result).toEqual({
      title: 'Album Name',
      catalogNumber: 'CAT-123',
      trackNumber: 2,
      trackTotal: 12,
    });
  });

  describe('URL fields', () => {
    it.each(['url', 'artwork'] as const)(
      'converts an absolute URL string in "%s" to a URL instance',
      (field) => {
        const value = 'https://example.com/album';
        const result = normalizeAlbumInfo({
          title: 'Album Name',
          [field]: value,
        });

        expect(result?.[field]).toBeInstanceOf(URL);
        expect(result?.[field]?.href).toBe(value);
      },
    );

    it.each(['url', 'artwork'] as const)(
      'preserves a URL instance in "%s"',
      (field) => {
        const url = new URL('https://example.com/album');
        const result = normalizeAlbumInfo({
          title: 'Album Name',
          [field]: url,
        });

        expect(result?.[field]).toBe(url);
      },
    );
  });

  it('omits invalid optional fields without discarding the album', () => {
    const result = normalizeAlbumInfo({
      title: 'Album Name',
      artists: [null, 42, ' '],
      catalogNumber: '   ',
      trackNumber: 1.5,
      trackTotal: 0,
      url: '/relative/path',
      artwork: 42,
    });

    expect(result).toEqual({
      title: 'Album Name',
    });
  });

  it('ignores properties that are not part of AlbumInfo', () => {
    const result = normalizeAlbumInfo({
      title: 'Album Name',
      unexpected: 'value',
    });

    expect(result).toEqual({
      title: 'Album Name',
    });
  });

  it('does not mutate the input object', () => {
    const input = {
      title: ' Album Name ',
      artists: [' Artist A ', 'Artist B'],
      catalogNumber: ' CAT-123 ',
      trackNumber: '2',
    };

    const originalInput = {
      ...input,
      artists: [...input.artists],
    };

    normalizeAlbumInfo(input);

    expect(input).toEqual(originalInput);
  });
});

describe('normalizePublisherInfo', () => {
  it.each([
    null,
    undefined,
    'Publisher Name',
    42,
    true,
    [],
    new Date(),
  ])('returns undefined for non-record input (%j)', (publisher) => {
    expect(normalizePublisherInfo(publisher)).toBeUndefined();
  });

  it('returns undefined when the name is missing', () => {
    expect(normalizePublisherInfo({})).toBeUndefined();
  });

  it.each([
    null,
    42,
    '',
    '   ',
    '\t\n',
  ])('returns undefined when the name is invalid (%j)', (name) => {
    expect(normalizePublisherInfo({ name })).toBeUndefined();
  });

  it('trims the publisher name', () => {
    const result = normalizePublisherInfo({
      name: '  Publisher Name  ',
    });

    expect(result).toEqual({
      name: 'Publisher Name',
    });
  });

  describe('URL fields', () => {
    it.each(['url', 'logotype'] as const)(
      'converts an absolute URL string in "%s" to a URL instance',
      (field) => {
        const value = 'https://example.com/publisher';
        const result = normalizePublisherInfo({
          name: 'Publisher Name',
          [field]: value,
        });

        expect(result?.[field]).toBeInstanceOf(URL);
        expect(result?.[field]?.href).toBe(value);
      },
    );

    it.each(['url', 'logotype'] as const)(
      'preserves a URL instance in "%s"',
      (field) => {
        const url = new URL('https://example.com/publisher');
        const result = normalizePublisherInfo({
          name: 'Publisher Name',
          [field]: url,
        });

        expect(result?.[field]).toBe(url);
      },
    );
  });

  it('omits invalid optional fields without discarding the publisher', () => {
    const result = normalizePublisherInfo({
      name: 'Publisher Name',
      url: '/relative/path',
      logotype: 42,
    });

    expect(result).toEqual({
      name: 'Publisher Name',
    });
  });

  it('ignores properties that are not part of PublisherInfo', () => {
    const result = normalizePublisherInfo({
      name: 'Publisher Name',
      unexpected: 'value',
    });

    expect(result).toEqual({
      name: 'Publisher Name',
    });
  });

  it('does not mutate the input object', () => {
    const input = {
      name: ' Publisher Name ',
      url: 'https://example.com/publisher',
      logotype: '/relative/path',
    };

    const originalInput = { ...input };

    normalizePublisherInfo(input);

    expect(input).toEqual(originalInput);
  });
});

describe('normalizeTrackDetails', () => {
  it.each([
    null,
    undefined,
    'Track Details',
    42,
    true,
    [],
    new Date(),
  ])('returns undefined for non-record input (%j)', (details) => {
    expect(normalizeTrackDetails(details)).toBeUndefined();
  });

  it('returns undefined when the duration is missing', () => {
    expect(normalizeTrackDetails({})).toBeUndefined();
  });

  it.each([
    undefined,
    null,
    '',
    '   ',
    'not a number',
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    true,
    [],
    {},
  ])('returns undefined for an invalid duration (%j)', (duration) => {
    expect(normalizeTrackDetails({ duration })).toBeUndefined();
  });

  it('accepts a positive numeric duration', () => {
    expect(normalizeTrackDetails({ duration: 184.37 })).toEqual({
      duration: 184.37,
    });
  });

  it('converts a positive numeric string to a number', () => {
    expect(normalizeTrackDetails({ duration: '184.37' })).toEqual({
      duration: 184.37,
    });
  });

  it.each([
    { value: 184.376, expected: 184.38 },
    { value: 184.374, expected: 184.37 },
    { value: '184.376', expected: 184.38 },
  ])(
    'rounds duration $value to two decimal places',
    ({ value, expected }) => {
      expect(normalizeTrackDetails({ duration: value })).toEqual({
        duration: expected,
      });
    },
  );

  it('ignores properties that are not part of TrackDetails', () => {
    const result = normalizeTrackDetails({
      duration: 184.37,
      unexpected: 'value',
    });

    expect(result).toEqual({
      duration: 184.37,
    });
  });

  it('does not mutate the input object', () => {
    const input = {
      duration: '184.376',
      unexpected: 'value',
    };

    const originalInput = { ...input };

    normalizeTrackDetails(input);

    expect(input).toEqual(originalInput);
  });
});

describe('normalizeTrackInfo', () => {
  it.each([
    null,
    undefined,
    'Track Info',
    42,
    true,
    [],
    new Date(),
  ])('returns undefined for non-record input (%j)', (trackInfo) => {
    expect(normalizeTrackInfo(trackInfo)).toBeUndefined();
  });

  it('returns an empty object for empty record input', () => {
    expect(normalizeTrackInfo({})).toEqual({});
  });

  it('normalizes top-level fields', () => {
    const released = new Date('2024-05-17T00:00:00.000Z');
    const url = 'https://example.com/track';
    const waveform = 'https://example.com/waveform';

    const result = normalizeTrackInfo({
      url,
      artists: 'Artist A, Guest One, Artist B',
      title: '  Track Name feat Guest One  ',
      remixers: [' Remixer A ', 'Remixer B'],
      released,
      year: '2022',
      genre: ' House ',
      subgenre: ' Deep House ',
      bpm: '128.5',
      key: 'G♯ minor',
      isrc: ' ISRC123 ',
      ufid: ' UFID123 ',
      waveform,
    });

    expect(result).toMatchObject({
      artists: ['Artist A', 'Artist B'],
      title: 'Track Name (feat. Guest One)',
      remixers: ['Remixer A', 'Remixer B'],
      released,
      year: 2022,
      genre: 'House',
      subgenre: 'Deep House',
      bpm: 128.5,
      key: 'G#m',
      isrc: 'ISRC123',
      ufid: 'UFID123',
    });

    expect(result?.url).toBeInstanceOf(URL);
    expect(result?.waveform).toBeInstanceOf(URL);

    expect(result?.url?.href).toBe(url);
    expect(result?.waveform?.href).toBe(waveform);
  });

  it('derives the year from the release date when the input year is invalid', () => {
    const released = new Date('2024-05-17T00:00:00.000Z');

    const result = normalizeTrackInfo({
      released: released.toISOString(),
      year: 'invalid',
    });

    expect(result).toEqual({
      released,
      year: 2024,
    });
  });

  describe('genre fields', () => {
    it('splits genre and subgenre when genre contains the separator', () => {
      const result = normalizeTrackInfo({
        genre: ' House | Deep House ',
        subgenre: 'Tech House',
      });

      expect(result).toEqual({
        genre: 'House',
        subgenre: 'Deep House',
      });
    });

    it('omits subgenre when the main genre is missing', () => {
      const result = normalizeTrackInfo({
        subgenre: 'Deep House',
      });

      expect(result).toEqual({});
    });
  });

  it('omits invalid optional fields while keeping valid fields', () => {
    const result = normalizeTrackInfo({
      title: ' Track Name ',
      url: '/relative/path',
      artists: [null, 42, ' '],
      remixers: [''],
      released: 'not a date',
      year: -1,
      genre: ' ',
      subgenre: 'Deep House',
      bpm: 'invalid',
      key: 'H major',
      isrc: ' ',
      ufid: null,
      waveform: '/relative/path',
      album: { title: ' ' },
      publisher: { name: ' ' },
      details: { duration: 0 },
    });

    expect(result).toEqual({
      title: 'Track Name',
    });
  });

  it('normalizes nested album, publisher, and details objects', () => {
    const result = normalizeTrackInfo({
      album: {
        title: ' Album — ‘Edition’ ',
        trackNumber: '2',
      },
      publisher: {
        name: ' Publisher Name ',
      },
      details: {
        duration: '184.376',
      },
    });

    expect(result).toEqual({
      album: {
        title: "Album - 'Edition'",
        trackNumber: 2,
      },
      publisher: {
        name: 'Publisher Name',
      },
      details: {
        duration: 184.38,
      },
    });
  });

  it('ignores properties that are not part of TrackInfo', () => {
    const result = normalizeTrackInfo({
      title: 'Track Name',
      unexpected: 'value',
    });

    expect(result).toEqual({
      title: 'Track Name',
    });
  });

  it('does not mutate the input object', () => {
    const input = {
      title: ' Track Name ',
      artists: [' Artist A '],
      album: {
        title: ' Album Name ',
        artists: [' Artist B '],
      },
      publisher: {
        name: ' Publisher Name ',
      },
      details: {
        duration: '184.376',
      },
    };

    const originalInput = {
      ...input,
      artists: [...input.artists],
      album: {
        ...input.album,
        artists: [...input.album.artists],
      },
      publisher: { ...input.publisher },
      details: { ...input.details },
    };

    normalizeTrackInfo(input);

    expect(input).toEqual(originalInput);
  });
});
