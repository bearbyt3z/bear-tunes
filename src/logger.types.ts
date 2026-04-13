import type { TransformableInfo } from 'logform';

/**
 * Represents any value that can appear as a log error context.
 *
 * Covers all JavaScript primitives, plain objects, `Error` instances,
 * `null`, and `undefined` to allow safe and explicit handling of each
 * case without falling back to base object stringification.
 */
export type LoggerErrorValue =
  | Error
  | object
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

/**
 * Extends Winston's {@link TransformableInfo} with additional fields
 * used to carry structured error and timestamp data through the
 * format pipeline.
 *
 * - `error` — raw error value of any supported type.
 * - `errorMessage` — string representation of the error, derived from `error`.
 * - `errorStack` — stack trace string, present only for `Error` instances.
 * - `timestamp` — formatted date-time string added by the timestamp formatter.
 */
export type LoggerInfo = TransformableInfo & {
  error?: LoggerErrorValue;
  errorMessage?: string;
  errorStack?: string;
  timestamp?: string;
};
