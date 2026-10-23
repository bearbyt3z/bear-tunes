import { describe, expect, it } from 'vitest';

import { normalizeString, normalizeTextCharacters } from './string.js';

describe('normalizeString', () => {
  it.each([
    {
      input: '  text  ',
      expected: 'text',
    },
    {
      input: '\t text \n',
      expected: 'text',
    },
    {
      input: '\u00A0text\u00A0',
      expected: 'text',
    },
    {
      input: 'text',
      expected: 'text',
    },
  ])('trims whitespace from "$input"', ({ input, expected }) => {
    expect(normalizeString(input)).toBe(expected);
  });

  it.each([
    '',
    ' ',
    '\t\n',
    '\u00A0',
  ])('returns undefined for an empty string after trimming (%j)', (input) => {
    expect(normalizeString(input)).toBeUndefined();
  });

  it.each([
    null,
    undefined,
    123,
    true,
    {},
    [],
  ])('returns undefined for a non-string input (%#)', (value) => {
    expect(normalizeString(value)).toBeUndefined();
  });
});

describe('normalizeTextCharacters', () => {
  it.each([
    {
      input: '`',
      expected: "'",
    },
    {
      input: '‘',
      expected: "'",
    },
    {
      input: '’',
      expected: "'",
    },
    {
      input: '–',
      expected: '-',
    },
    {
      input: '—',
      expected: '-',
    },
  ])('normalizes "$input" to "$expected"', ({ input, expected }) => {
    expect(normalizeTextCharacters(input)).toBe(expected);
  });

  it('normalizes all supported characters throughout the text', () => {
    expect(normalizeTextCharacters('‘Artist’s — live—version`')).toBe(
      "'Artist's - live-version'",
    );
  });

  it('leaves unsupported typographic characters unchanged', () => {
    const input = "Beyoncé “Live” · − - '";

    expect(normalizeTextCharacters(input)).toBe(input);
  });

  it('returns the original text when no supported characters are present', () => {
    const input = 'Artist - Title (Live)';

    expect(normalizeTextCharacters(input)).toBe(input);
  });
});
