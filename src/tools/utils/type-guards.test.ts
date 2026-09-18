import { describe, expect, it, expectTypeOf } from 'vitest';
import {
  isEmptyPlainObject,
  isErrorWithStringCode,
  isObjectArray,
  isObjectRecord,
  isUnknownArray,
} from '#tools';

describe('isEmptyPlainObject', () => {
  it('returns true for an empty plain object', () => {
    expect(isEmptyPlainObject({})).toBe(true);
  });

  it('returns false when the object has a non-enumerable property', () => {
    const value = {};

    Object.defineProperty(value, 'hidden', {
      value: 'hidden',
      enumerable: false,
    });

    expect(isEmptyPlainObject(value)).toBe(false);
  });

  it('returns false when the object has a symbol property', () => {
    const value = {
      [Symbol('key')]: 'value',
    };

    expect(isEmptyPlainObject(value)).toBe(false);
  });

  it('returns false for a non-empty plain object', () => {
    expect(isEmptyPlainObject({ key: 'value' })).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isEmptyPlainObject(null)).toBe(false);
    expect(isEmptyPlainObject(undefined)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isEmptyPlainObject([])).toBe(false);
  });

  it('returns false for objects with a null prototype', () => {
    expect(isEmptyPlainObject(Object.create(null))).toBe(false);
  });

  it('returns false for class instances', () => {
    expect(isEmptyPlainObject(new Date())).toBe(false);
  });

  it('narrows the value to Record<string, never>', () => {
    const value: unknown = {};

    if (isEmptyPlainObject(value)) {
      expectTypeOf(value).toEqualTypeOf<Record<string, never>>();
      expectTypeOf(value.someKey).toEqualTypeOf<never>();
    }
  });
});

describe('isErrorWithStringCode', () => {
  it('returns true for an Error with a string code', () => {
    const error = Object.assign(new Error('File not found'), {
      code: 'ENOENT',
    });

    expect(isErrorWithStringCode(error)).toBe(true);
  });

  it('returns false for an Error without a code', () => {
    expect(isErrorWithStringCode(new Error('File not found'))).toBe(false);
  });

  it('returns false for an Error with a non-string code', () => {
    const error = Object.assign(new Error('Something went wrong'), {
      code: 404,
    });

    expect(isErrorWithStringCode(error)).toBe(false);
  });

  it('returns false for a non-Error object with a string code', () => {
    expect(isErrorWithStringCode({ code: 'ENOENT' })).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isErrorWithStringCode(null)).toBe(false);
    expect(isErrorWithStringCode(undefined)).toBe(false);
    expect(isErrorWithStringCode('ENOENT')).toBe(false);
    expect(isErrorWithStringCode(404)).toBe(false);
  });

  it('narrows the value to Error with a string code', () => {
    const value: unknown = Object.assign(new Error('File not found'), {
      code: 'ENOENT',
    });

    if (isErrorWithStringCode(value)) {
      expectTypeOf(value).toEqualTypeOf<Error & { code: string }>();
      expectTypeOf(value.code).toEqualTypeOf<string>();
    }
  });
});

describe('isObjectRecord', () => {
  it('returns true for a plain object', () => {
    expect(isObjectRecord({ key: 'value' })).toBe(true);
  });

  it('returns true for an object with a null prototype', () => {
    expect(isObjectRecord(Object.create(null))).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isObjectRecord([])).toBe(false);
  });

  it('returns false for class instances', () => {
    expect(isObjectRecord(new Date())).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isObjectRecord(null)).toBe(false);
    expect(isObjectRecord(undefined)).toBe(false);
  });

  it('returns false for primitive values', () => {
    expect(isObjectRecord('value')).toBe(false);
    expect(isObjectRecord(42)).toBe(false);
    expect(isObjectRecord(true)).toBe(false);
  });

  it('narrows the value to a string-keyed record', () => {
    const value: unknown = {
      key: 'value',
    };

    if (isObjectRecord(value)) {
      expectTypeOf(value).toEqualTypeOf<Record<string, unknown>>();
      expectTypeOf(value.key).toEqualTypeOf<unknown>();
    }
  });
});

describe('isUnknownArray', () => {
  it('returns true for arrays', () => {
    expect(isUnknownArray(['artist', 42, null])).toBe(true);
  });

  it('returns true for an empty array', () => {
    expect(isUnknownArray([])).toBe(true);
  });

  it('returns false for non-array values', () => {
    expect(isUnknownArray({})).toBe(false);
    expect(isUnknownArray('value')).toBe(false);
    expect(isUnknownArray(null)).toBe(false);
    expect(isUnknownArray(undefined)).toBe(false);
  });

  it('narrows the value to an array of unknown values', () => {
    const value: unknown = ['artist', 42, null];

    if (isUnknownArray(value)) {
      expectTypeOf(value).toEqualTypeOf<unknown[]>();
      expectTypeOf(value[0]).toEqualTypeOf<unknown>();
    }
  });
});

describe('isObjectArray', () => {
  it('returns true for an array of non-null non-array objects', () => {
    expect(isObjectArray([
      { title: 'Track' },
      { artist: 'Artist' },
    ])).toBe(true);
  });

  it('returns true for an empty array', () => {
    expect(isObjectArray([])).toBe(true);
  });

  it('returns true for an array of class instances', () => {
    expect(isObjectArray([new Date(), new Date()])).toBe(true);
  });

  it('returns false when the array contains null', () => {
    expect(isObjectArray([{ title: 'Track' }, null])).toBe(false);
  });

  it('returns false when the array contains an array', () => {
    expect(isObjectArray([{ title: 'Track' }, []])).toBe(false);
  });

  it('returns false when the array contains a primitive value', () => {
    expect(isObjectArray([{ title: 'Track' }, 'Artist'])).toBe(false);
  });

  it('returns false for non-array values', () => {
    expect(isObjectArray({ title: 'Track' })).toBe(false);
    expect(isObjectArray('Track')).toBe(false);
    expect(isObjectArray(null)).toBe(false);
    expect(isObjectArray(undefined)).toBe(false);
  });

  it('narrows the value to an array of records', () => {
    const value: unknown = [{ title: 'Track' }];

    if (isObjectArray(value)) {
      expectTypeOf(value).toEqualTypeOf<object[]>();
    }
  });
});
