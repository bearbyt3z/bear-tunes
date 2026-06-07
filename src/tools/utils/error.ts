import type { ZodError } from 'zod';

function formatZodIssueInput(input: unknown): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(input);
  } catch {
    return '[Unserializable input]';
  }
}

/**
 * Converts a Zod validation error into a compact, log-friendly list of issues.
 *
 * Each returned entry contains only the issue path, code, and message,
 * which makes validation logs shorter and easier to scan than logging
 * the full `ZodError` object.
 *
 * The issue path is flattened into a dot-delimited string. When an issue
 * has no path, the returned `path` value is an empty string.
 *
 * @param error - Zod validation error to format.
 * @returns Simplified validation issues for structured logging.
 */
export function formatZodErrorIssues(error: ZodError): {
  path: string;
  code: string;
  message: string;
  input?: string;
}[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
    input: formatZodIssueInput(issue.input),
  }));
}

/**
 * A no-op error handler intended to be passed as a callback
 * wherever an error should be silently ignored.
 */
export function ignoreError(): void { /* intentionally empty */ }

/**
 * Converts an unknown thrown value into an `Error` instance.
 *
 * Non-`Error` values are wrapped with `new Error(String(error))`
 * so callers can safely work with a consistent error type.
 *
 * @param error - Unknown value that was thrown.
 * @returns `Error` instance representing the thrown value.
 */
export function normalizeUnknownError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
