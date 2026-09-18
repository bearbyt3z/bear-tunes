import { describe, expect, it } from 'vitest';
import {
  capitalize,
  escapeRegExpChars,
  escapeUnescapedColons,
  replacePathForbiddenChars,
  replacePathForbiddenCharsInArray,
} from '#tools';

describe('escapeUnescapedColons', () => {
  it('escapes unescaped colons', () => {
    expect(escapeUnescapedColons('genre:house')).toBe(String.raw`genre\:house`);
  });

  it('escapes multiple unescaped colons', () => {
    expect(escapeUnescapedColons('genre:house:deep')).toBe(
      String.raw`genre\:house\:deep`,
    );
  });

  it('preserves already escaped colons', () => {
    expect(escapeUnescapedColons(String.raw`genre\:house`)).toBe(
      String.raw`genre\:house`,
    );
  });

  it('handles a mix of escaped and unescaped colons', () => {
    expect(escapeUnescapedColons(String.raw`genre:house\:deep:tech`)).toBe(
      String.raw`genre\:house\:deep\:tech`,
    );
  });

  it('returns an unchanged string when no colons are present', () => {
    const input = 'genre-house';

    expect(escapeUnescapedColons(input)).toBe(input);
  });

  it('is idempotent', () => {
    const input = String.raw`genre:house\:deep`;

    const result = escapeUnescapedColons(input);

    expect(escapeUnescapedColons(result)).toBe(result);
  });
});

describe('capitalize', () => {
  it('capitalizes the first character', () => {
    expect(capitalize('track title')).toBe('Track title');
  });

  it('preserves the remaining characters', () => {
    expect(capitalize('tRACK title')).toBe('TRACK title');
  });

  it('preserves strings that are already capitalized', () => {
    expect(capitalize('Track title')).toBe('Track title');
  });

  it('returns an empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('escapeRegExpChars', () => {
  it('escapes regular expression special characters', () => {
    expect(escapeRegExpChars(String.raw`.*+?^$(){}|[]/\-`)).toBe(
      String.raw`\.\*\+\?\^\$\(\)\{\}\|\[\]\/\\\-`,
    );
  });

  it('leaves non-special characters unchanged', () => {
    expect(escapeRegExpChars('track, title _123!')).toBe('track, title _123!');
  });

  it('escapes only the special characters in a mixed string', () => {
    expect(escapeRegExpChars('Track (Remix) + Edit')).toBe(
      String.raw`Track \(Remix\) \+ Edit`,
    );
  });

  it('returns an empty string unchanged', () => {
    expect(escapeRegExpChars('')).toBe('');
  });
});

describe('replacePathForbiddenChars', () => {
  it('replaces path-forbidden characters with hyphens', () => {
    expect(replacePathForbiddenChars(String.raw`/\*?<>|:"`)).toBe('---------');
  });

  it('replaces forbidden characters throughout the string', () => {
    expect(replacePathForbiddenChars('Artist: Track/Remix?')).toBe(
      'Artist- Track-Remix-',
    );
  });

  it('preserves characters that are allowed in paths', () => {
    const input = 'Artist - Track (Remix)';

    expect(replacePathForbiddenChars(input)).toBe(input);
  });

  it('returns an empty string unchanged', () => {
    expect(replacePathForbiddenChars('')).toBe('');
  });
});

describe('replacePathForbiddenCharsInArray', () => {
  it('replaces forbidden characters in every string', () => {
    const input = [
      'Artist:One',
      'Artist/Two',
      'Artist?Three',
    ];

    expect(replacePathForbiddenCharsInArray(input)).toEqual([
      'Artist-One',
      'Artist-Two',
      'Artist-Three',
    ]);
  });

  it('preserves strings without forbidden characters', () => {
    const input = [
      'Artist One',
      'Artist Two',
    ];

    expect(replacePathForbiddenCharsInArray(input)).toEqual(input);
  });

  it('returns an empty array for an empty input', () => {
    const input: string[] = [];

    const result = replacePathForbiddenCharsInArray(input);

    expect(result).toEqual([]);
    expect(result).not.toBe(input);
  });

  it('does not mutate the input array', () => {
    const input = ['Artist:One', 'Artist/Two'];

    const result = replacePathForbiddenCharsInArray(input);

    expect(result).not.toBe(input);
    expect(input).toEqual(['Artist:One', 'Artist/Two']);
  });
});
