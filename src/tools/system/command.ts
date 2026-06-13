import * as childProcess from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { normalizeUnknownError } from '../utils/error.js';
import { getFirstLine } from '../utils/format.js';
import {
  FirstPipelineCommandFailedError,
  SecondPipelineCommandFailedError,
} from './command.errors.js';

import type {
  ClosedChildProcess,
  CommandToExecute,
  ExecuteCommandPipelineCaptureOptions,
  ExecutedCommandPipeline,
  ExecutedProcess,
} from './command.types.js';

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
 * Collects all binary output from a readable stream.
 *
 * The stream is read until it ends. If the stream is `null` or capturing is
 * disabled, the function resolves to `undefined`.
 *
 * @param stream - Readable stream to consume, or `null` when no stream is available.
 * @param enabled - Whether stream output should be captured.
 * @returns Promise resolved with the full captured stream output, or `undefined`.
 */
function collectBuffer(
  stream: NodeJS.ReadableStream | null,
  enabled: boolean,
): Promise<Buffer | undefined> {
  if (stream === null || !enabled) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer | string): void => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    stream.once('end', (): void => {
      resolve(Buffer.concat(chunks));
    });

    stream.once('error', (error: unknown): void => {
      reject(normalizeUnknownError(error));
    });
  });
}

/**
 * Creates a transform stream that forwards all chunks unchanged and optionally
 * captures them for later retrieval.
 *
 * @param enabled - Whether forwarded chunks should also be captured.
 * @returns Transform stream together with a getter for the captured output.
 */
function createCaptureTap(enabled: boolean): {
  stream: Transform;
  getBuffer: () => Buffer | undefined;
} {
  const chunks: Buffer[] = [];

  const stream = new Transform({
    transform(chunk: Buffer | string, _encoding: BufferEncoding, callback): void {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      if (enabled) {
        chunks.push(buffer);
      }

      callback(null, buffer);
    },
  });

  return {
    stream,
    getBuffer: (): Buffer | undefined => (enabled ? Buffer.concat(chunks) : undefined),
  };
}

/**
 * Waits until a child process either emits `error` or fully closes.
 *
 * This helper resolves exactly once. If the child process cannot be spawned
 * correctly, the returned result contains the emitted error. Otherwise, it
 * contains the close status and signal.
 *
 * @param child - Child process to observe.
 * @returns Promise resolved with the final child process result.
 */
function waitForChildProcessResult(
  child: childProcess.ChildProcess,
): Promise<ClosedChildProcess> {
  return new Promise((resolve) => {
    let settled = false;

    const resolveOnce = (result: ClosedChildProcess): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    child.once('error', (error: Error): void => {
      resolveOnce({
        status: null,
        signal: null,
        error,
      });
    });

    child.once('close', (status, signal): void => {
      resolveOnce({
        status,
        signal,
        error: undefined,
      });
    });
  });
}

/**
 * Executes a system command synchronously and returns its captured output.
 *
 * The command is executed with binary output capture. On success, the function
 * returns the process output and exit status. If the process cannot be started
 * or exits unsuccessfully, the function throws an error.
 *
 * @param commandName - Name or path of the executable to run.
 * @param args - Command-line arguments passed to the executable.
 * @returns Captured command output and exit status.
 * @throws Error when the process cannot be started or exits with a non-zero status.
 */
export function executeCommandSync(
  commandName: string,
  args: readonly string[],
): ExecutedProcess {
  const child = childProcess.spawnSync(commandName, [...args], { encoding: 'buffer' });

  if (child.error) {
    throw child.error;
  }

  if (child.status !== 0) {
    throw buildProcessExitError(
      commandName,
      child.status,
      child.signal,
      child.stderr?.toString('utf8') ?? '',
    );
  }

  return {
    stdout: child.stdout ?? undefined,
    stderr: child.stderr ?? undefined,
    status: child.status,
    signal: child.signal,
  };
}

/**
 * Executes two system commands connected with a pipe and returns both process results.
 *
 * The standard output of the first command is piped into the standard input of
 * the second command. Streams may be captured selectively. On success, the
 * function returns separate results for both commands so the caller can inspect
 * outputs, errors and exit statuses independently.
 *
 * @param firstCommand - The first command in the pipeline.
 * @param secondCommand - The second command in the pipeline.
 * @param captureOptions - Configuration describing which streams should be captured.
 * @returns Captured output of both commands in the successful pipeline.
 * @throws Error when the pipe itself fails or a child process cannot be started.
 * @throws FirstPipelineCommandFailedError when the first command exits unsuccessfully.
 * @throws SecondPipelineCommandFailedError when the second command exits unsuccessfully.
 */
export async function executeCommandPipeline(
  firstCommand: CommandToExecute,
  secondCommand: CommandToExecute,
  captureOptions: ExecuteCommandPipelineCaptureOptions = {},
): Promise<ExecutedCommandPipeline> {
  const capture = {
    firstStdout: false,
    firstStderr: true,
    secondStdout: true,
    secondStderr: true,
    ...captureOptions,
  } satisfies Required<ExecuteCommandPipelineCaptureOptions>;

  const firstChild = childProcess.spawn(firstCommand.commandName, [...firstCommand.args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const secondChild = childProcess.spawn(secondCommand.commandName, [...secondCommand.args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (
    firstChild.stdout === null
    || firstChild.stderr === null
    || secondChild.stdin === null
    || secondChild.stdout === null
    || secondChild.stderr === null
  ) {
    throw new Error('Failed to initialize child process pipes.');
  }

  const firstProcessPromise = waitForChildProcessResult(firstChild);
  const secondProcessPromise = waitForChildProcessResult(secondChild);

  const firstStdoutTap = createCaptureTap(capture.firstStdout);
  const firstStderrPromise = collectBuffer(firstChild.stderr, capture.firstStderr);
  const secondStdoutPromise = collectBuffer(secondChild.stdout, capture.secondStdout);
  const secondStderrPromise = collectBuffer(secondChild.stderr, capture.secondStderr);

  const pipelineErrorPromise = pipeline(
    firstChild.stdout,
    firstStdoutTap.stream,
    secondChild.stdin,
  )
    .then((): Error | undefined => undefined)
    .catch((error: unknown): Error => normalizeUnknownError(error));

  const [
    pipelineError,
    firstProcessResult,
    secondProcessResult,
    firstStderr,
    secondStdout,
    secondStderr,
  ] = await Promise.all([
    pipelineErrorPromise,
    firstProcessPromise,
    secondProcessPromise,
    firstStderrPromise,
    secondStdoutPromise,
    secondStderrPromise,
  ]);

  if (firstProcessResult.error !== undefined) {
    throw firstProcessResult.error;
  }

  if (secondProcessResult.error !== undefined) {
    throw secondProcessResult.error;
  }

  if (firstProcessResult.status !== 0) {
    const stderr = firstStderr?.toString('utf8') ?? '';

    throw new FirstPipelineCommandFailedError(
      buildProcessExitError(
        firstCommand.commandName,
        firstProcessResult.status,
        firstProcessResult.signal,
        stderr,
      ).message,
      firstCommand.commandName,
      firstProcessResult.status,
      firstProcessResult.signal,
      stderr,
    );
  }

  if (secondProcessResult.status !== 0) {
    const stderr = secondStderr?.toString('utf8') ?? '';

    throw new SecondPipelineCommandFailedError(
      buildProcessExitError(
        secondCommand.commandName,
        secondProcessResult.status,
        secondProcessResult.signal,
        stderr,
      ).message,
      secondCommand.commandName,
      secondProcessResult.status,
      secondProcessResult.signal,
      stderr,
    );
  }

  if (pipelineError !== undefined) {
    throw pipelineError;
  }

  return {
    first: {
      stdout: firstStdoutTap.getBuffer(),
      stderr: firstStderr,
      status: firstProcessResult.status,
      signal: firstProcessResult.signal,
    },
    second: {
      stdout: secondStdout,
      stderr: secondStderr,
      status: secondProcessResult.status,
      signal: secondProcessResult.signal,
    },
  };
}
