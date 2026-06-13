/**
 * Base error describing a failed command executed as part of a two-process pipeline.
 *
 * Stores the failing command name together with its termination details and
 * captured standard error output.
 */
abstract class PipelineCommandFailedError extends Error {
  /** Name or path of the command that failed. */
  readonly commandName: string;

  /** Exit status reported by the failed process, or `null` if it terminated due to a signal. */
  readonly status: number | null;

  /** Signal that terminated the failed process, or `null` if it exited normally. */
  readonly signal: NodeJS.Signals | null;

  /** Standard error output captured from the failed process. */
  readonly stderr: string;

  /**
   * Creates a pipeline command failure error with process metadata.
   *
   * @param message - Human-readable error message describing the failure.
   * @param commandName - Name or path of the command that failed.
   * @param status - Exit status reported by the failed process, or `null` if it terminated due to a signal.
   * @param signal - Signal that terminated the failed process, or `null` if it exited normally.
   * @param stderr - Standard error output captured from the failed process.
   */
  protected constructor(
    message: string,
    commandName: string,
    status: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
  ) {
    super(message);
    this.name = new.target.name;
    this.commandName = commandName;
    this.status = status;
    this.signal = signal;
    this.stderr = stderr;
  }
}

/**
 * Error thrown when the first command in a two-process pipeline fails.
 */
export class FirstPipelineCommandFailedError extends PipelineCommandFailedError {
  /**
   * Creates an error for a failure of the first pipeline command.
   *
   * @param message - Human-readable error message describing the failure.
   * @param commandName - Name or path of the command that failed.
   * @param status - Exit status reported by the failed process, or `null` if it terminated due to a signal.
   * @param signal - Signal that terminated the failed process, or `null` if it exited normally.
   * @param stderr - Standard error output captured from the failed process.
   */
  constructor(
    message: string,
    commandName: string,
    status: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
  ) {
    super(message, commandName, status, signal, stderr);
  }
}

/**
 * Error thrown when the second command in a two-process pipeline fails.
 */
export class SecondPipelineCommandFailedError extends PipelineCommandFailedError {
  /**
   * Creates an error for a failure of the second pipeline command.
   *
   * @param message - Human-readable error message describing the failure.
   * @param commandName - Name or path of the command that failed.
   * @param status - Exit status reported by the failed process, or `null` if it terminated due to a signal.
   * @param signal - Signal that terminated the failed process, or `null` if it exited normally.
   * @param stderr - Standard error output captured from the failed process.
   */
  constructor(
    message: string,
    commandName: string,
    status: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
  ) {
    super(message, commandName, status, signal, stderr);
  }
}
