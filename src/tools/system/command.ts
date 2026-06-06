import * as childProcess from 'node:child_process';

import { getFirstLine } from '../utils/format.js';

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

/**
 * Creates an error describing an unsuccessful child process termination.
 *
 * If the child process terminated due to a signal, the returned error describes
 * the signal. Otherwise, the returned error describes the numeric exit status
 * together with the first line of the standard error output.
 *
 * @param commandName - Name or path of the executable that was run.
 * @param status - Exit status returned by the child process, or `null` when the
 * process terminated due to a signal.
 * @param signal - Signal that terminated the child process, or `null` when the
 * process exited normally.
 * @param stderr - Standard error output captured from the child process.
 * @returns Error describing why the child process did not complete successfully.
 */
function buildProcessExitError(
  commandName: string,
  status: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): Error {
  if (status === null) {
    return new Error(
      `Child process "${commandName}" terminated due to signal ${signal ?? 'unknown'}.`,
    );
  }

  return new Error(
    `Child process "${commandName}" exited with code ${status}: ${getFirstLine(stderr)}`,
  );
}

/**
 * Executes a system command synchronously and returns its captured output.
 *
 * The command is executed with UTF-8 text encoding. On success, the function
 * returns the process output and exit status. If the process cannot be started,
 * terminates without an exit code, or exits with a non-zero status, the
 * function throws an error.
 *
 * @param commandName - Name or path of the executable to run.
 * @param args - Command-line arguments passed to the executable.
 * @returns Captured command output and exit status.
 * @throws Error when the process cannot be started, terminates without an exit
 * code, or exits with a non-zero status.
 */
export function executeCommandSync(commandName: string, args: readonly string[]): ExecutedProcess {
  const child = childProcess.spawnSync(commandName, [...args], { encoding: 'utf8' });

  if (child.error) {
    throw child.error;
  }

  if (child.status !== 0) {
    throw buildProcessExitError(commandName, child.status, child.signal, child.stderr);
  }

  return {
    stdout: child.stdout,
    stderr: child.stderr,
    status: child.status,
    signal: child.signal,
  };
}
