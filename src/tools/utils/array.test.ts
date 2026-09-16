import { describe, expect, it } from 'vitest';
import {
  arrayDifference,
  arrayIntersection,
  arrayToLowerCase,
} from '#tools';

describe('arrayDifference', () => {
  it('returns values from the first array that are not present in the second', () => {
    expect(
      arrayDifference(['one', 'two', 'three'], ['two']),
    ).toEqual(['one', 'three']);
  });

  it('preserves duplicates from the first array', () => {
    expect(
      arrayDifference(['one', 'one', 'two'], ['two']),
    ).toEqual(['one', 'one']);
  });

  it('returns all values from the first array when the second array is empty', () => {
    expect(
      arrayDifference(['one', 'two', 'three'], []),
    ).toEqual(['one', 'two', 'three']);
  });

  it('returns all values when the arrays have no common values', () => {
    expect(
      arrayDifference(['one', 'two'], ['three', 'four']),
    ).toEqual(['one', 'two']);
  });

  it('works with numbers', () => {
    expect(arrayDifference([1, 2, 3], [2])).toEqual([1, 3]);
  });

  it('works with object references', () => {
    const shared = { id: 2 };

    expect(
      arrayDifference([{ id: 1 }, shared], [shared]),
    ).toEqual([{ id: 1 }]);
  });
});

describe('arrayIntersection', () => {
  it('returns values present in both arrays', () => {
    expect(
      arrayIntersection(['one', 'two', 'three'], ['two', 'four']),
    ).toEqual(['two']);
  });

  it('preserves duplicates from the first array', () => {
    expect(
      arrayIntersection(['one', 'one', 'two'], ['one', 'three']),
    ).toEqual(['one', 'one']);
  });

  it('returns an empty array when the second array is empty', () => {
    expect(
      arrayIntersection(['one', 'two', 'three'], []),
    ).toEqual([]);
  });

  it('returns an empty array when the arrays have no common values', () => {
    expect(
      arrayIntersection(['one', 'two'], ['three', 'four']),
    ).toEqual([]);
  });

  it('works with numbers', () => {
    expect(arrayIntersection([1, 2, 3], [2, 4])).toEqual([2]);
  });

  it('works with object references', () => {
    const shared = { id: 2 };

    expect(
      arrayIntersection([{ id: 1 }, shared], [shared]),
    ).toEqual([shared]);
  });
});

describe('arrayToLowerCase', () => {
  it('converts all values to lowercase', () => {
    expect(arrayToLowerCase(['Foo', 'BAR'])).toEqual(['foo', 'bar']);
  });

  it('returns an empty array for empty input', () => {
    expect(arrayToLowerCase([])).toEqual([]);
  });

  it('preserves non-letter characters', () => {
    expect(
      arrayToLowerCase(['Hello, WORLD!', '123', 'foo-bar_42']),
    ).toEqual(['hello, world!', '123', 'foo-bar_42']);
  });
});
