import type { ZodError } from 'zod';

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
}[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }));
}

/**
 * A no-op error handler intended to be passed as a callback
 * wherever an error should be silently ignored.
 */
export function ignoreError(): void { /* intentionally empty */ }
