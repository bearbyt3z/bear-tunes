import { describe, expect, it } from 'vitest';

import {
  buildGenreTag,
  buildTrackFullName,
  extractTrackNameKeywords,
} from '#tools';

describe('buildGenreTag', () => {
  it('returns the genre name when no sub-genre is provided', () => {
    expect(buildGenreTag('House')).toBe('House');
  });

  it('combines the genre and sub-genre with a separator', () => {
    expect(buildGenreTag('Drum & Bass', 'Jungle')).toBe(
      'Drum & Bass | Jungle',
    );
  });

  it('trims whitespace from the genre and sub-genre names', () => {
    expect(buildGenreTag('  Drum & Bass  ', '  Jungle  ')).toBe(
      'Drum & Bass | Jungle',
    );
  });

  it('handles genre names containing punctuation', () => {
    expect(
      buildGenreTag(
        'Techno (Raw / Deep / Hypnotic)',
        'Deep / Hypnotic',
      ),
    ).toBe('Techno (Raw / Deep / Hypnotic) | Deep / Hypnotic');
  });

  it('omits an empty sub-genre', () => {
    expect(buildGenreTag('House', '')).toBe('House');
  });

  it('omits a whitespace-only sub-genre', () => {
    expect(buildGenreTag('House', '   ')).toBe('House');
  });

  it('returns undefined when the genre is not provided', () => {
    expect(buildGenreTag()).toBeUndefined();
    expect(buildGenreTag(undefined, 'Jungle')).toBeUndefined();
  });

  it('returns undefined when the genre is empty or whitespace-only', () => {
    expect(buildGenreTag('')).toBeUndefined();
    expect(buildGenreTag('   ')).toBeUndefined();
  });
});

describe('buildTrackFullName', () => {
  it('returns the title when no artists are provided', () => {
    expect(buildTrackFullName({ title: 'Track Title' })).toBe('Track Title');
  });

  it('returns the artist name when no title is provided', () => {
    expect(buildTrackFullName({ artists: ['Artist'] })).toBe('Artist');
  });

  it('returns undefined when neither artists nor title are provided', () => {
    expect(buildTrackFullName({})).toBeUndefined();
  });

  it('returns undefined when the artists list is empty and no title is provided', () => {
    expect(buildTrackFullName({ artists: [] })).toBeUndefined();
  });

  it('combines multiple artists and title', () => {
    expect(
      buildTrackFullName({
        artists: ['Artist One', 'Artist Two'],
        title: 'Track Title',
      }),
    ).toBe('Artist One, Artist Two - Track Title');
  });

  it('trims whitespace from artists and title', () => {
    expect(
      buildTrackFullName({
        artists: ['  Artist One  ', ' Artist Two '],
        title: '  Track Title  ',
      }),
    ).toBe('Artist One, Artist Two - Track Title');
  });

  it('ignores empty and whitespace-only artist entries', () => {
    expect(
      buildTrackFullName({
        artists: ['Artist', '', '   ', 'Other'],
        title: 'Track',
      }),
    ).toBe('Artist, Other - Track');
  });

  it('treats an empty title as unavailable', () => {
    expect(
      buildTrackFullName({
        artists: ['Artist'],
        title: '',
      }),
    ).toBe('Artist');
  });

  it('treats a whitespace-only title as unavailable', () => {
    expect(
      buildTrackFullName({
        artists: ['Artist'],
        title: '   ',
      }),
    ).toBe('Artist');
  });

  it('treats whitespace-only artists as unavailable', () => {
    expect(
      buildTrackFullName({
        artists: ['   '],
      }),
    ).toBeUndefined();
  });
});

describe('extractTrackNameKeywords', () => {
  it('extracts keywords from a track name with a leading track number', () => {
    expect(
      extractTrackNameKeywords('01 - Artist - Title (Original Mix)'),
    ).toEqual(['Artist', 'Title', 'Original', 'Mix']);
  });

  it('extracts keywords from a track name containing remix information', () => {
    expect(
      extractTrackNameKeywords('Artist Title (RemixerArtist Extended Remix)'),
    ).toEqual(['Artist', 'Title', 'RemixerArtist', 'Extended', 'Remix']);
  });

  it('removes track number prefixes from the beginning or after spaced dash-like separators', () => {
    expect(
      extractTrackNameKeywords('01 - Artist - Title'),
    ).toEqual(['Artist', 'Title']);

    expect(
      extractTrackNameKeywords('01. Artist - Title'),
    ).toEqual(['Artist', 'Title']);

    expect(
      extractTrackNameKeywords('01 – Artist – Title'),
    ).toEqual(['Artist', 'Title']);

    expect(
      extractTrackNameKeywords('01 — Artist — Title'),
    ).toEqual(['Artist', 'Title']);

    expect(
      extractTrackNameKeywords('Artist - 01 - Title'),
    ).toEqual(['Artist', 'Title']);

    expect(
      extractTrackNameKeywords('Artist – 01. Title'),
    ).toEqual(['Artist', 'Title']);

    expect(
      extractTrackNameKeywords('Artist — 01 — Title'),
    ).toEqual(['Artist', 'Title']);
  });

  it('preserves numbers that are not formatted as track number prefixes', () => {
    expect(
      extractTrackNameKeywords('Artist - 007 title'),
    ).toEqual(['Artist', '007', 'title']);

    expect(
      extractTrackNameKeywords('Artist 01 - Title'),
    ).toEqual(['Artist', '01', 'Title']);
  });

  it('replaces brackets and commas with spaces', () => {
    expect(
      extractTrackNameKeywords('Artist, Title (Original) [Mix]'),
    ).toEqual(['Artist', 'Title', 'Original', 'Mix']);
  });

  it('treats spaced dash-like separators and ampersands as separators', () => {
    expect(
      extractTrackNameKeywords('Artist - Title – Remix — Mix & Edit'),
    ).toEqual(['Artist', 'Title', 'Remix', 'Mix', 'Edit']);
  });

  it('preserves hyphens and ampersands that are part of a keyword', () => {
    expect(
      extractTrackNameKeywords('Kay-D AT&T'),
    ).toEqual(['Kay-D', 'AT&T']);
  });

  it('collapses repeated whitespace and trims the result', () => {
    expect(
      extractTrackNameKeywords('  Artist   Title \t  Remix  '),
    ).toEqual(['Artist', 'Title', 'Remix']);
  });

  it('de-duplicates keywords while preserving first occurrence order', () => {
    expect(
      extractTrackNameKeywords('Artist Title Artist Remix Title'),
    ).toEqual(['Artist', 'Title', 'Remix']);
  });

  it('preserves keyword casing when de-duplicating', () => {
    expect(
      extractTrackNameKeywords('Artist artist ARTIST'),
    ).toEqual(['Artist', 'artist', 'ARTIST']);
  });

  it('returns an empty array for an empty track name', () => {
    expect(extractTrackNameKeywords('')).toEqual([]);
  });

  it('returns an empty array for whitespace-only input', () => {
    expect(extractTrackNameKeywords('   \t\n  ')).toEqual([]);
  });
});
