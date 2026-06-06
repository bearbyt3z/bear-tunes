/**
 * Result of a completed child process.
 *
 * Contains the captured standard output and standard error streams together
 * with the numeric exit status and optional termination signal.
 */
export interface ExecutedProcess {
  stdout: string;
  stderr: string;
  status: number;
  signal: NodeJS.Signals | null;
}
