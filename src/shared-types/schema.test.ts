import { describe, expect, it } from 'vitest';

import {
  albumInfoSchema,
  publisherInfoSchema,
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
