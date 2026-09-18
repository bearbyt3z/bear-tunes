import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  normalizeTrailingPathSeparators,
  removeFilenameExtension,
  replaceFilenameExtension,
} from '#tools';

describe('normalizeTrailingPathSeparators', () => {
  it('returns a path without trailing separators unchanged', () => {
    expect(normalizeTrailingPathSeparators('music/artist/album')).toBe(
      'music/artist/album',
    );
  });

  it('normalizes a single trailing separator', () => {
    expect(
      normalizeTrailingPathSeparators(`music/artist/album${path.sep}`),
    ).toBe(`music/artist/album${path.sep}`);
  });

  it('replaces multiple trailing separators with a single platform-specific separator', () => {
    expect(normalizeTrailingPathSeparators('music/artist/album///')).toBe(
      `music/artist/album${path.sep}`,
    );
    expect(normalizeTrailingPathSeparators('music/artist/album\\\\')).toBe(
      `music/artist/album${path.sep}`,
    );
    expect(normalizeTrailingPathSeparators('music/artist/album/\\/\\/')).toBe(
      `music/artist/album${path.sep}`,
    );
  });

  it('returns the root path unchanged', () => {
    expect(normalizeTrailingPathSeparators(path.sep)).toBe(path.sep);
  });
});

describe('replaceFilenameExtension', () => {
  it('replaces the filename extension', () => {
    expect(replaceFilenameExtension('track.mp3', '.flac')).toBe('track.flac');
  });

  it('accepts an extension without a leading dot', () => {
    expect(replaceFilenameExtension('track.mp3', 'flac')).toBe('track.flac');
  });

  it('preserves the directory path', () => {
    const filePath = path.join('music', 'artist', 'track.mp3');

    expect(replaceFilenameExtension(filePath, '.flac')).toBe(
      path.join('music', 'artist', 'track.flac'),
    );
  });

  it('replaces only the final filename extension', () => {
    expect(replaceFilenameExtension('track.backup.mp3', '.flac')).toBe(
      'track.backup.flac',
    );
  });

  it('adds an extension when the filename has none', () => {
    expect(replaceFilenameExtension('track', '.flac')).toBe('track.flac');
  });

  it('preserves a hidden filename when replacing its extension', () => {
    expect(replaceFilenameExtension('.track', '.flac')).toBe('.track.flac');
  });

  it('throws a TypeError for an empty replacement', () => {
    expect(() => replaceFilenameExtension('track.mp3', '')).toThrow(
      new TypeError('Replacement must be a non-empty string.'),
    );
  });
});

describe('removeFilenameExtension', () => {
  it('removes the filename extension', () => {
    expect(removeFilenameExtension('track.mp3')).toBe('track');
  });

  it('preserves the directory path', () => {
    const filePath = path.join('music', 'artist', 'track.mp3');

    expect(removeFilenameExtension(filePath)).toBe(
      path.join('music', 'artist', 'track'),
    );
  });

  it('removes only the final filename extension', () => {
    expect(removeFilenameExtension('track.backup.mp3')).toBe(
      'track.backup',
    );
  });

  it('returns the filename unchanged when it has no extension', () => {
    expect(removeFilenameExtension('track')).toBe('track');
  });

  it('preserves a hidden filename without an extension', () => {
    expect(removeFilenameExtension('.track')).toBe('.track');
  });

  it('removes an extension consisting only of a trailing dot', () => {
    expect(removeFilenameExtension('track.')).toBe('track');
  });

  it('returns an empty string for empty input', () => {
    expect(removeFilenameExtension('')).toBe('');
  });
});
