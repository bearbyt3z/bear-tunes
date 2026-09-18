import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  formatZodErrorIssues,
  ignoreError,
  normalizeUnknownError,
} from '#tools';

describe('formatZodErrorIssues', () => {
  it('formats a single validation issue', () => {
    const error = new ZodError([
      {
        path: ['title'],
        code: 'custom',
        message: 'Invalid title',
        input: 'Track',
      },
    ]);

    expect(formatZodErrorIssues(error)).toEqual([
      {
        path: 'title',
        code: 'custom',
        message: 'Invalid title',
        input: '"Track"',
      },
    ]);
  });

  it('joins nested issue paths with dots', () => {
    const error = new ZodError([
      {
        path: ['track', 'artist', 'name'],
        code: 'custom',
        message: 'Invalid artist name',
        input: 42,
      },
    ]);

    expect(formatZodErrorIssues(error)).toEqual([
      {
        path: 'track.artist.name',
        code: 'custom',
        message: 'Invalid artist name',
        input: '42',
      },
    ]);
  });

  it('returns an empty path for an issue without a path', () => {
    const error = new ZodError([
      {
        path: [],
        code: 'custom',
        message: 'Invalid value',
        input: true,
      },
    ]);

    expect(formatZodErrorIssues(error)).toEqual([
      {
        path: '',
        code: 'custom',
        message: 'Invalid value',
        input: 'true',
      },
    ]);
  });

  it('omits the input value when the issue input is undefined', () => {
    const error = new ZodError([
      {
        path: ['title'],
        code: 'custom',
        message: 'Invalid title',
      },
    ]);

    expect(formatZodErrorIssues(error)).toEqual([
      {
        path: 'title',
        code: 'custom',
        message: 'Invalid title',
      },
    ]);
  });

  it('serializes object inputs as JSON', () => {
    const input = {
      title: 'Track',
      artists: ['Artist'],
    };

    const error = new ZodError([
      {
        path: ['track'],
        code: 'custom',
        message: 'Invalid track',
        input,
      },
    ]);

    expect(formatZodErrorIssues(error)).toEqual([
      {
        path: 'track',
        code: 'custom',
        message: 'Invalid track',
        input: JSON.stringify(input),
      },
    ]);
  });

  it('uses a placeholder when the issue input cannot be serialized', () => {
    const input: Record<string, unknown> = {};
    input.self = input;

    const error = new ZodError([
      {
        path: ['track'],
        code: 'custom',
        message: 'Invalid track',
        input,
      },
    ]);

    expect(formatZodErrorIssues(error)).toEqual([
      {
        path: 'track',
        code: 'custom',
        message: 'Invalid track',
        input: '[Unserializable input]',
      },
    ]);
  });

  it('formats multiple issues', () => {
    const error = new ZodError([
      {
        path: ['title'],
        code: 'custom',
        message: 'Invalid title',
        input: 'Track',
      },
      {
        path: ['artist', 'name'],
        code: 'custom',
        message: 'Invalid artist name',
        input: 'Artist',
      },
    ]);

    expect(formatZodErrorIssues(error)).toEqual([
      {
        path: 'title',
        code: 'custom',
        message: 'Invalid title',
        input: '"Track"',
      },
      {
        path: 'artist.name',
        code: 'custom',
        message: 'Invalid artist name',
        input: '"Artist"',
      },
    ]);
  });

  it('returns an empty array for an error without issues', () => {
    const error = new ZodError([]);

    expect(formatZodErrorIssues(error)).toEqual([]);
  });
});

describe('ignoreError', () => {
  it('does nothing and returns undefined', () => {
    expect(ignoreError()).toBeUndefined();
  });
});

describe('normalizeUnknownError', () => {
  it('returns an existing Error instance unchanged', () => {
    const error = new Error('Something went wrong');

    expect(normalizeUnknownError(error)).toBe(error);
  });

  it('wraps a string in an Error', () => {
    const result = normalizeUnknownError('Something went wrong');

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Something went wrong');
  });

  it('wraps a number in an Error', () => {
    const result = normalizeUnknownError(404);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('404');
  });

  it('wraps null in an Error', () => {
    const result = normalizeUnknownError(null);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('null');
  });

  it('wraps undefined in an Error', () => {
    const result = normalizeUnknownError(undefined);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('undefined');
  });

  it('preserves Error subclasses without wrapping them', () => {
    const error = new TypeError('Invalid value');

    expect(normalizeUnknownError(error)).toBe(error);
  });
});
