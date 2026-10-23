import { describe, expect, it } from 'vitest';

import { normalizeTrackKey, trackKeyPattern } from './track-key.js';

describe('trackKeyPattern', () => {
  it.each([
    'C',
    'G#m',
    'Bb',
    'Cbm',
    'A#',
    'Fm',
  ])('matches canonical track key "%s"', (key) => {
    expect(trackKeyPattern.test(key)).toBe(true);
  });

  it.each([
    'c',
    'g#m',
    'H',
    'C##',
    'Cbb',
    'C♭',
    'C major',
    '',
  ])('rejects non-canonical track key "%s"', (key) => {
    expect(trackKeyPattern.test(key)).toBe(false);
  });
});

describe('normalizeTrackKey', () => {
  it.each([
    { input: 'C', expected: 'C' },
    { input: 'G#m', expected: 'G#m' },
    { input: 'Bb', expected: 'Bb' },
    { input: 'Cbm', expected: 'Cbm' },
    { input: 'c', expected: 'C' },
    { input: 'g#m', expected: 'G#m' },
    { input: 'bb minor', expected: 'Bbm' },
    { input: 'c major', expected: 'C' },
    { input: 'A Major', expected: 'A' },
    { input: 'A minor', expected: 'Am' },
    { input: 'A min', expected: 'Am' },
    { input: 'G♯ minor', expected: 'G#m' },
    { input: 'B♭ Major', expected: 'Bb' },
    { input: ' C # minor ', expected: 'C#m' },
    { input: 'D♭ minor', expected: 'Dbm' },
  ])('normalizes "$input" to $expected', ({ input, expected }) => {
    expect(normalizeTrackKey(input)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    ' ',
    '\t\n',
  ])('returns undefined for an empty input (%j)', (input) => {
    expect(normalizeTrackKey(input)).toBeUndefined();
  });

  it.each([
    'H',
    'C##',
    'Cbb',
    'C♮',
    'not a key',
    'C majorx',
    'f sharp minor',
  ])('returns undefined for an invalid key "%s"', (input) => {
    expect(normalizeTrackKey(input)).toBeUndefined();
  });
});
