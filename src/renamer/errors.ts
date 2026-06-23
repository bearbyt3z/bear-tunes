import {
  BearTunesRenamerFailureCode,
} from './types.js';

/**
 * Internal guard error used to abort renamer flow when a rename
 * precondition is not satisfied.
 *
 * This error is thrown by internal renamer helpers that use fail-fast
 * validation. It carries the renamer-specific
 * {@link BearTunesRenamerFailureCode} together with the underlying
 * {@link Error} instance that describes the actual failure cause.
 *
 * Public renamer methods may catch this error and map it to a
 * {@link BearTunesRenamerFailureResult}, preserving the renamer failure
 * code while exposing the underlying error as part of the returned result.
 */
export class RenamerGuardError extends Error {
  /** Renamer-specific code classifying the guard failure. */
  readonly failureCode: BearTunesRenamerFailureCode;

  /** Underlying error describing the actual failure cause. */
  override readonly cause: Error;

  /**
   * Creates a new internal renamer guard error.
   *
   * @param failureCode - Renamer-specific code classifying the guard failure.
   * @param cause - Underlying error describing the actual failure cause.
   */
  constructor(
    failureCode: BearTunesRenamerFailureCode,
    cause: Error,
  ) {
    super(cause.message, { cause });
    this.name = this.constructor.name;
    this.failureCode = failureCode;
    this.cause = cause;
  }
}
