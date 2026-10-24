import { describe, expect, it } from 'vitest';

import { normalizeUrl } from './url.js';

describe('normalizeUrl', () => {
  it('parses a valid absolute URL string', () => {
    const result = normalizeUrl('https://example.com/track');

    expect(result).toBeInstanceOf(URL);
    expect(result?.href).toBe('https://example.com/track');
  });

  it('returns a parsed URL with the native URL normalization', () => {
    const result = normalizeUrl('https://EXAMPLE.com');

    expect(result?.href).toBe('https://example.com/');
  });

  it('returns an existing URL instance unchanged', () => {
    const url = new URL('https://example.com/track');

    expect(normalizeUrl(url)).toBe(url);
  });

  it.each([
    '',
    ' ',
    'not-a-url',
    '/track',
    'track/page',
    'https://',
  ])('returns undefined for an invalid or relative URL (%j)', (value) => {
    expect(normalizeUrl(value)).toBeUndefined();
  });

  it.each([
    null,
    undefined,
    123,
    true,
    {},
    [],
  ])('returns undefined for an unsupported input (%#)', (value) => {
    expect(normalizeUrl(value)).toBeUndefined();
  });
});
