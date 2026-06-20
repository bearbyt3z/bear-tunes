import {
  BearTunesConverterFailureCode,
} from './types.js';

export class ConverterGuardError extends Error {
  readonly failureCode: BearTunesConverterFailureCode;
  override readonly cause: Error;

  constructor(
    failureCode: BearTunesConverterFailureCode,
    cause: Error,
  ) {
    super(cause.message, { cause });
    this.name = new.target.name;
    this.failureCode = failureCode;
    this.cause = cause;
  }
}
