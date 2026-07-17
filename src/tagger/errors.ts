import type { BearTunesTaggerFailureCode } from './types.js';

/**
 * Internal error used to pass a classified tagger failure from a guard or
 * reader helper to the public result-based API.
 *
 * @internal
 */
export class TaggerGuardError extends Error {
  /** Tagger-specific code classifying the guard failure. */
  readonly failureCode: BearTunesTaggerFailureCode;

  /** Underlying error describing the actual failure cause. */
  override readonly cause: Error;

  /**
   * Optional structured details intended for higher-level logging.
   */
  readonly details?: Record<string, unknown>;

  /**
   * Creates a new internal tagger guard error.
   *
   * @param failureCode - Tagger-specific code classifying the failure.
   * @param cause - Underlying error describing the actual failure cause.
   * @param details - Optional structured diagnostic details.
   */
  constructor(
    failureCode: BearTunesTaggerFailureCode,
    cause: Error,
    details?: Record<string, unknown>,
  ) {
    super(cause.message, { cause });
    this.name = this.constructor.name;
    this.failureCode = failureCode;
    this.cause = cause;
    this.details = details;
  }
}
