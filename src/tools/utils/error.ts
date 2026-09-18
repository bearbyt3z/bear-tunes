import type { ZodError } from 'zod';

/**
 * Formats an arbitrary value for inclusion in a formatted Zod issue.
 *
 * `undefined` values are omitted by returning `undefined`. Other values are
 * serialized with `JSON.stringify()`. If serialization throws, a placeholder
 * string is returned instead.
 *
 * Some values may also produce `undefined` because `JSON.stringify()` does not
 * return a serialized representation for them.
 *
 * @param input - Value from a Zod issue to format.
 * @returns A JSON string, `undefined` when the value has no JSON representation,
 * or a placeholder when serialization fails.
 */
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
 * Each returned entry contains the issue path, code, message, and an optional
 * JSON-formatted representation of the issue input, which makes validation
 * logs shorter and easier to scan than logging the full `ZodError` object.
 *
 * The issue path is flattened into a dot-delimited string. When an issue
 * has no path, the returned `path` value is an empty string. When the issue
 * has no input value, the `input` property is omitted.
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
