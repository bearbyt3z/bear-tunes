import type { TransformableInfo } from 'logform';

/**
 * Represents any value that can be attached to a log entry as structured
 * context or error data.
 *
 * The union intentionally includes plain objects, primitives, `Error`,
 * `null`, and `undefined` so the logger can normalize and render values
 * explicitly without relying on implicit object stringification.
 */
export type LoggerValue =
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
 * Winston log payload extended with fields used internally by the custom
 * formatting pipeline.
 *
 * @property error - Raw error value passed by the caller.
 * @property errorMessage - Human-readable error representation derived from `error`.
 * @property errorStack - Stack trace extracted from `Error` instances.
 * @property metadata - Additional non-reserved log properties collected for structured rendering.
 * @property timestamp - Formatted timestamp added by Winston's timestamp formatter.
 */
export type LoggerInfo = TransformableInfo & {
  error?: LoggerValue;
  errorMessage?: string;
  errorStack?: string;
  metadata?: Record<string, LoggerValue>;
  timestamp?: string;
};
