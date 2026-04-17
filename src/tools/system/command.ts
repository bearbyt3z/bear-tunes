import * as childProcess from 'node:child_process';

import { getFirstLine } from '../utils/format.js';

/**
 * Result of a successfully executed system command.
 *
 * Contains the captured standard output and standard error streams together
 * with the numeric exit status reported by the child process.
 */
export interface ExecutedCommand {
  stdout: string;
  stderr: string;
  status: number;
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
export function executeCommandSync(commandName: string, args: readonly string[]): ExecutedCommand {
  const child = childProcess.spawnSync(commandName, [...args], { encoding: 'utf8' });

  if (child.error) {
    throw child.error;
  }

  if (child.status === null) {
    throw new Error(`Child process "${commandName}" terminated without an exit code.`);
  }

  if (child.status !== 0) {
    throw new Error(
      `Child process "${commandName}" exited with code ${child.status}: ${getFirstLine(child.stderr)}`
    );
  }

  return {
    stdout: child.stdout,
    stderr: child.stderr,
    status: child.status,
  };
}
