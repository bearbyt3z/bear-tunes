import { describe, expect, it } from 'vitest';
import { removeUndefinedObjectFields } from '#tools';

import type { TrackInfo } from '#shared-types';

describe('removeUndefinedObjectFields', () => {
  it('removes properties with undefined values', () => {
    const input = {
      title: 'Track',
      artist: undefined,
      album: 'Album',
    };

    expect(removeUndefinedObjectFields(input)).toEqual({
      title: 'Track',
      album: 'Album',
    });
  });

  it('preserves all defined values', () => {
    const input = {
      title: 'Track',
      artist: 'Artist',
      year: 2025,
    };

    expect(removeUndefinedObjectFields(input)).toEqual(input);
  });

  it('preserves null, false, zero, and empty strings', () => {
    const input = {
      nullable: null,
      boolean: false,
      number: 0,
      text: '',
      missing: undefined,
    };

    expect(removeUndefinedObjectFields(input)).toEqual({
      nullable: null,
      boolean: false,
      number: 0,
      text: '',
    });
  });

  it('preserves arrays and nested objects', () => {
    const nested = { value: undefined };
    const input = {
      array: [1, 2, 3],
      object: nested,
      missing: undefined,
    };

    const result = removeUndefinedObjectFields(input);

    expect(result).toEqual({
      array: [1, 2, 3],
      object: nested,
    });
    expect(result.array).toEqual([1, 2, 3]);
    expect(result.object).toBe(nested);
  });

  it('returns a new object without mutating the input', () => {
    const input = {
      title: 'Track',
      artist: undefined,
    };

    const result = removeUndefinedObjectFields(input);

    expect(result).not.toBe(input);
    expect(input).toEqual({
      title: 'Track',
      artist: undefined,
    });
  });

  it('returns an empty object when all properties are undefined', () => {
    const input = {
      title: undefined,
      artist: undefined,
      album: undefined,
    };

    expect(removeUndefinedObjectFields(input)).toEqual({});
  });

  it('returns an empty object for an empty input object', () => {
    const input = {};

    const result = removeUndefinedObjectFields(input);

    expect(result).toEqual({});
    expect(result).not.toBe(input);
  });

  it('removes undefined fields from a TrackInfo object', () => {
    const trackInfo: TrackInfo = {
      title: 'Example Track',
      artists: ['Example Artist'],
      released: new Date('2025-01-15'),
      year: undefined,
      genre: undefined,
      bpm: 128,
      url: new URL('https://example.com/track'),
      details: {
        duration: 245,
      },
    };

    const result = removeUndefinedObjectFields(trackInfo);

    expect(result).toEqual({
      title: 'Example Track',
      artists: ['Example Artist'],
      released: new Date('2025-01-15'),
      bpm: 128,
      url: new URL('https://example.com/track'),
      details: {
        duration: 245,
      },
    });
  });
});
