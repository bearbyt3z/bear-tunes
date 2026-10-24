import { describe, expect, it } from 'vitest';

import { normalizeTrackArtists } from './track-artists.js';

describe('normalizeTrackArtists', () => {
  it('returns an empty array for null or empty input', () => {
    expect(normalizeTrackArtists(null)).toEqual([]);
    expect(normalizeTrackArtists([])).toEqual([]);
  });

  it('trims artist names and removes blank entries', () => {
    expect(
      normalizeTrackArtists([
        ' Artist A ',
        '',
        '  ',
        'Artist B',
      ]),
    ).toEqual(['Artist A', 'Artist B']);
  });

  it('normalizes supported typographic characters', () => {
    expect(
      normalizeTrackArtists([
        'Artist’s Name',
        'Live—Band',
      ]),
    ).toEqual([
      "Artist's Name",
      'Live-Band',
    ]);
  });

  it('removes duplicate artist names case-insensitively while preserving the first occurrence', () => {
    expect(
      normalizeTrackArtists([
        'Artist A',
        'artist a',
        'ARTIST A',
        'Artist B',
        'artist b',
      ]),
    ).toEqual(['Artist A', 'Artist B']);
  });

  it('deduplicates after trimming and character normalization', () => {
    expect(
      normalizeTrackArtists([
        '  Artist’s Name ',
        "artist's name",
      ]),
    ).toEqual(["Artist's Name"]);
  });

  it('preserves a comma-separated entry with only one non-empty part', () => {
    expect(
      normalizeTrackArtists(['Artist A,']),
    ).toEqual(['Artist A,']);
  });

  it('excludes artists mentioned after the feat marker in the title', () => {
    expect(
      normalizeTrackArtists(
        ['Main Artist', 'Featured Artist'],
        'Main Artist feat. Featured Artist - Track',
      ),
    ).toEqual(['Main Artist']);
  });

  it('excludes artists mentioned after the ft marker in the title', () => {
    expect(
      normalizeTrackArtists(
        ['Main Artist', 'Guest Artist'],
        'Main Artist ft Guest Artist',
      ),
    ).toEqual(['Main Artist']);
  });

  it('matches featured artist names case-insensitively', () => {
    expect(
      normalizeTrackArtists(
        ['Guest Artist'],
        'Main Artist feat. GUEST ARTIST',
      ),
    ).toEqual([]);
  });

  it('preserves artists that are not identified as featured in the title', () => {
    expect(
      normalizeTrackArtists(
        ['Main Artist', 'Guest Artist'],
        'Main Artist - Original Mix',
      ),
    ).toEqual(['Main Artist', 'Guest Artist']);
  });

  it('removes a combined artist entry when all parts are present separately', () => {
    expect(
      normalizeTrackArtists([
        'Artist A',
        'Artist B',
        'Artist A, Artist B',
      ]),
    ).toEqual(['Artist A', 'Artist B']);
  });

  it('matches combined artist parts case-insensitively', () => {
    expect(
      normalizeTrackArtists([
        'Artist A',
        'artist b',
        'ARTIST A, Artist B',
      ]),
    ).toEqual(['Artist A', 'artist b']);
  });

  it('preserves a combined artist entry when one of its parts is not present separately', () => {
    expect(
      normalizeTrackArtists([
        'Artist A',
        'Artist A, Guest Artist',
      ]),
    ).toEqual([
      'Artist A',
      'Artist A, Guest Artist',
    ]);
  });

  it('preserves the first occurrence when a duplicate precedes a combined entry', () => {
    expect(
      normalizeTrackArtists([
        'artist a',
        'Artist A',
        'Artist B',
        'Artist A, Artist B',
      ]),
    ).toEqual(['artist a', 'Artist B']);
  });

  it('returns an empty array when all entries are blank', () => {
    expect(
      normalizeTrackArtists([
        '',
        '  ',
        '\t',
      ]),
    ).toEqual([]);
  });
});
