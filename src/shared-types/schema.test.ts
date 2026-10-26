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

  it('allows the release date to be omitted', () => {
    expect(trackInfoSchema.parse({})).toEqual({});
  });
});
