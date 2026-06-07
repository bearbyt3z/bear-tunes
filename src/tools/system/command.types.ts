/**
 * Definition of a system command to be executed.
 */
export interface CommandToExecute {
  commandName: string;
  args: readonly string[];
}

/**
 * Result of a closed child process.
 *
 * Contains the exit status reported by the child process together with the
 * optional termination signal received on process close, or the process error
 * when the child process could not be started correctly.
 */
export interface ClosedChildProcess {
  status: number | null;
  signal: NodeJS.Signals | null;
  error: Error | undefined;
}

/**
 * Result of a completed child process.
 *
 * Contains optionally captured standard output and standard error streams
 * together with the numeric exit status and optional termination signal.
 */
export interface ExecutedProcess {
  stdout: Buffer | undefined;
  stderr: Buffer | undefined;
  status: number;
  signal: NodeJS.Signals | null;
}

/**
 * Result of a successfully executed pipeline of two system commands.
 *
 * Each process result is returned separately so the caller can decide how to
 * interpret and present outputs and errors.
 */
export interface ExecutedCommandPipeline {
  first: ExecutedProcess;
  second: ExecutedProcess;
}

/**
 * Configuration describing which process streams should be captured.
 *
 * Streams that are not captured are returned as `undefined` in the execution result.
 */
export interface ExecuteCommandPipelineCaptureOptions {
  firstStdout?: boolean;
  firstStderr?: boolean;
  secondStdout?: boolean;
  secondStderr?: boolean;
}
