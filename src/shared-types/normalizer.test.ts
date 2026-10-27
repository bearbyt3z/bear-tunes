import { describe, expect, it } from 'vitest';

import {
  normalizeAlbumInfo,
  normalizePublisherInfo,
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
