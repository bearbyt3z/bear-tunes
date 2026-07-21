import {
  BearTunesConverterFailureCode,
} from './types.js';

/**
 * Internal guard error used to abort converter flow when a conversion
 * precondition is not satisfied.
 *
 * This error is thrown by internal converter helpers that use fail-fast
 * validation. It carries the converter-specific {@link BearTunesConverterFailureCode}
 * together with the underlying {@link Error} instance that describes the
 * actual failure cause.
 *
 * Public converter methods may catch this error and map it to a
 * {@link BearTunesConverterFailureResult}, preserving the converter failure
 * code while exposing the underlying error as part of the returned result.
 *
 * @internal
 */
export class ConverterGuardError extends Error {
  /** Converter-specific code classifying the guard failure. */
  readonly failureCode: BearTunesConverterFailureCode;

  /** Underlying error describing the actual failure cause. */
  override readonly cause: Error;

  /**
   * Creates a new internal converter guard error.
   *
   * @param failureCode - Converter-specific code classifying the guard failure.
   * @param cause - Underlying error describing the actual failure cause.
   */
  constructor(
    failureCode: BearTunesConverterFailureCode,
    cause: Error,
  ) {
    super(cause.message, { cause });
    this.name = this.constructor.name;
    this.failureCode = failureCode;
    this.cause = cause;
  }
}
