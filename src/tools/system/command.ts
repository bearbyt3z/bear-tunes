import * as childProcess from 'node:child_process';

import { getFirstLine } from '../utils/format.js';

export interface ExecutedCommand {
  stdout: string;
  stderr: string;
  status: number;
}

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
