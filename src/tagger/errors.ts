import type { BearTunesTaggerFailureCode } from './types.js';

/**
 * Internal guard error used to abort tagger flow with a classified failure.
 *
 * This error is thrown by internal tagger guards and helpers that need to
 * stop the current operation while preserving a
 * {@link BearTunesTaggerFailureCode}, the underlying {@link Error}, and
 * optional structured diagnostic details.
 *
 * Public tagger methods catch this error and map it to a
 * {@link BearTunesTaggerFailureResult}, preserving the tagger failure code,
 * underlying error, and diagnostic details in the returned result.
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
