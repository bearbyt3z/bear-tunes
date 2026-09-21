import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CommandExecutionFailedError,
  CommandExecutionStartError,
  CommandPipelineInfrastructureError,
  FirstPipelineCommandFailedError,
  SecondPipelineCommandFailedError,
} from './command.errors.js';

import {
  executeCommandPipeline,
  executeCommandSync,
} from '#tools';

type MockChildProcess = EventEmitter & {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  stdin: NodeJS.WritableStream | null;
};

interface PipelineTestSetup {
  firstChild: MockChildProcess;
  secondChild: MockChildProcess;
  secondInput: string[];
  secondStdin: PassThrough;
}

interface PipelineStreamChunks {
  firstStdout?: readonly (string | Buffer)[];
  firstStderr?: readonly (string | Buffer)[];
  secondStdout?: readonly (string | Buffer)[];
  secondStderr?: readonly (string | Buffer)[];
}

const { mockedSpawn, mockedSpawnSync } = vi.hoisted(() => ({
  mockedSpawn: vi.fn(),
  mockedSpawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mockedSpawn,
  spawnSync: mockedSpawnSync,
}));

function createMockChildProcess({
  stdout = Readable.from([]),
  stderr = Readable.from([]),
  stdin = new PassThrough(),
}: {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  stdin?: NodeJS.WritableStream | null;
} = {}): MockChildProcess {
  return Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin,
  });
}

function setupPipelineChildren({
  firstStdout = ['first output'],
  firstStderr = [Buffer.from('first stderr')],
  secondStdout = ['second stdout'],
  secondStderr = [Buffer.from('second stderr')],
}: PipelineStreamChunks = {}): PipelineTestSetup {
  const firstChild = createMockChildProcess({
    stdout: Readable.from(firstStdout),
    stderr: Readable.from(firstStderr),
    stdin: null,
  });

  const secondStdin = new PassThrough({
    decodeStrings: false,
  });

  const secondChild = createMockChildProcess({
    stdout: Readable.from(secondStdout),
    stderr: Readable.from(secondStderr),
    stdin: secondStdin,
  });

  const secondInput: string[] = [];

  secondStdin.on('data', (chunk: Buffer | string): void => {
    secondInput.push(
      typeof chunk === 'string' ? chunk : chunk.toString('utf8'),
    );
  });

  mockedSpawn
    .mockReturnValueOnce(firstChild)
    .mockReturnValueOnce(secondChild);

  return {
    firstChild,
    secondChild,
    secondInput,
    secondStdin,
  };
}

describe('executeCommandSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the command output and process status', () => {
    const stdout = Buffer.from('command output');
    const stderr = Buffer.from('command error');

    mockedSpawnSync.mockReturnValueOnce({
      pid: 1234,
      output: [null, stdout, stderr],
      stdout,
      stderr,
      status: 0,
      signal: null,
    });

    const result = executeCommandSync('/usr/bin/example', [
      '--input',
      'track.flac',
    ]);

    expect(result).toEqual({
      stdout,
      stderr,
      status: 0,
      signal: null,
    });

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      '/usr/bin/example',
      ['--input', 'track.flac'],
      { encoding: 'buffer' },
    );
    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for null output streams', () => {
    mockedSpawnSync.mockReturnValueOnce({
      pid: 1234,
      output: [null, null, null],
      stdout: null,
      stderr: null,
      status: 0,
      signal: null,
    });

    expect(
      executeCommandSync('/usr/bin/example', []),
    ).toEqual({
      stdout: undefined,
      stderr: undefined,
      status: 0,
      signal: null,
    });
  });

  it('throws CommandExecutionStartError when the process cannot be started', () => {
    const cause = new Error('ENOENT');

    mockedSpawnSync.mockReturnValueOnce({
      pid: 1234,
      output: [null, null, null],
      stdout: null,
      stderr: null,
      status: null,
      signal: null,
      error: cause,
    });

    let thrownError: unknown;

    try {
      executeCommandSync('/usr/bin/missing', []);
    } catch (caught) {
      thrownError = caught;
    }

    expect(thrownError).toBeInstanceOf(CommandExecutionStartError);
    expect(thrownError).toMatchObject({
      commandName: '/usr/bin/missing',
      cause,
    });
  });

  it('throws CommandExecutionFailedError for a non-zero exit status', () => {
    const stdout = Buffer.from('command output');
    const stderr = Buffer.from(
      'first error line\nsecond error line',
    );

    mockedSpawnSync.mockReturnValueOnce({
      pid: 1234,
      output: [null, stdout, stderr],
      stdout,
      stderr,
      status: 2,
      signal: null,
    });

    try {
      executeCommandSync('/usr/bin/example', ['--fail']);
    } catch (error) {
      expect(error).toBeInstanceOf(CommandExecutionFailedError);
      expect(error).toMatchObject({
        commandName: '/usr/bin/example',
        status: 2,
        signal: null,
        stdout,
        stderr,
      });
      expect(error).toHaveProperty(
        'message',
        'Child process "/usr/bin/example" exited with code 2: first error line',
      );
    }
  });

  it('uses a placeholder when stderr is empty and the command exits unsuccessfully', () => {
    mockedSpawnSync.mockReturnValueOnce({
      pid: 1234,
      output: [null, Buffer.from('command output'), Buffer.alloc(0)],
      stdout: Buffer.from('command output'),
      stderr: Buffer.alloc(0),
      status: 1,
      signal: null,
    });

    let thrownError: unknown;

    try {
      executeCommandSync('/usr/bin/example', ['--fail']);
    } catch (caught) {
      thrownError = caught;
    }

    expect(thrownError).toBeInstanceOf(CommandExecutionFailedError);
    expect(thrownError).toMatchObject({
      message:
        'Child process "/usr/bin/example" exited with code 1: [no stderr output]',
      commandName: '/usr/bin/example',
      status: 1,
      signal: null,
      stdout: Buffer.from('command output'),
      stderr: Buffer.alloc(0),
    });
  });

  it('handles null output streams when the command exits unsuccessfully', () => {
    mockedSpawnSync.mockReturnValueOnce({
      pid: 1234,
      output: [null, null, null],
      stdout: null,
      stderr: null,
      status: 1,
      signal: null,
    });

    let thrownError: unknown;

    try {
      executeCommandSync('/usr/bin/example', ['--fail']);
    } catch (caught) {
      thrownError = caught;
    }

    expect(thrownError).toBeInstanceOf(CommandExecutionFailedError);
    expect(thrownError).toMatchObject({
      commandName: '/usr/bin/example',
      status: 1,
      signal: null,
      stdout: undefined,
      stderr: undefined,
      message:
        'Child process "/usr/bin/example" exited with code 1: [stderr output not captured]',
    });
  });

  it('throws CommandExecutionFailedError when the process terminates due to a signal', () => {
    const stdout = Buffer.from('');
    const stderr = Buffer.from('command terminated');

    mockedSpawnSync.mockReturnValueOnce({
      pid: 1234,
      output: [null, stdout, stderr],
      stdout,
      stderr,
      status: null,
      signal: 'SIGTERM',
    });

    try {
      executeCommandSync('/usr/bin/example', []);
    } catch (error) {
      expect(error).toBeInstanceOf(CommandExecutionFailedError);
      expect(error).toMatchObject({
        commandName: '/usr/bin/example',
        status: null,
        signal: 'SIGTERM',
        stdout,
        stderr,
      });
      expect(error).toHaveProperty(
        'message',
        'Child process "/usr/bin/example" terminated due to signal SIGTERM.',
      );
    }
  });
});

describe('executeCommandPipeline', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns both process results and forwards first command output to the second command', async () => {
    const setup = setupPipelineChildren();

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: ['--input', 'track.flac'],
      },
      {
        commandName: 'second-command',
        args: ['--output', 'result.flac'],
      },
    );

    setup.firstChild.emit('close', 0, null);
    setup.secondChild.emit('close', 0, null);

    await expect(resultPromise).resolves.toEqual({
      first: {
        stdout: undefined,
        stderr: Buffer.from('first stderr'),
        status: 0,
        signal: null,
      },
      second: {
        stdout: Buffer.from('second stdout'),
        stderr: Buffer.from('second stderr'),
        status: 0,
        signal: null,
      },
    });

    expect(setup.secondInput).toEqual(['first output']);

    expect(mockedSpawn).toHaveBeenNthCalledWith(
      1,
      'first-command',
      ['--input', 'track.flac'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    expect(mockedSpawn).toHaveBeenNthCalledWith(
      2,
      'second-command',
      ['--output', 'result.flac'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    expect(mockedSpawn).toHaveBeenCalledTimes(2);
  });

  it('captures configured streams and discards uncaptured streams', async () => {
    const setup = setupPipelineChildren({
      firstStdout: [Buffer.from('first output')],
      firstStderr: [Buffer.from('first stderr')],
      secondStdout: ['second stdout'],
      secondStderr: [Buffer.from('second stderr')],
    });

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
      {
        firstStdout: true,
        firstStderr: false,
        secondStdout: false,
        secondStderr: false,
      },
    );

    setup.firstChild.emit('close', 0, null);
    setup.secondChild.emit('close', 0, null);

    await expect(resultPromise).resolves.toEqual({
      first: {
        stdout: Buffer.from('first output'),
        stderr: undefined,
        status: 0,
        signal: null,
      },
      second: {
        stdout: undefined,
        stderr: undefined,
        status: 0,
        signal: null,
      },
    });

    expect(setup.secondInput).toEqual(['first output']);
  });

  it('throws CommandPipelineInfrastructureError when starting the first child process fails', async () => {
    const cause = new Error('Failed to start first process');

    mockedSpawn.mockImplementationOnce(() => {
      throw cause;
    });

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    await expect(resultPromise).rejects.toBeInstanceOf(
      CommandPipelineInfrastructureError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to start command pipeline child processes.',
      cause,
    });
  });

  it('throws CommandPipelineInfrastructureError when starting the second child process fails', async () => {
    const cause = new Error('Failed to start second process');
    const firstChild = createMockChildProcess();

    mockedSpawn.mockReturnValueOnce(firstChild);
    mockedSpawn.mockImplementationOnce(() => {
      throw cause;
    });

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    await expect(resultPromise).rejects.toBeInstanceOf(
      CommandPipelineInfrastructureError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to start command pipeline child processes.',
      cause,
    });
  });

  it('throws CommandPipelineInfrastructureError when the first child stdout pipe is unavailable', async () => {
    const setup = setupPipelineChildren();

    setup.firstChild.stdout = null;

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to initialize child process pipes for command pipeline.',
    });
  });

  it('throws CommandPipelineInfrastructureError when the first child stderr pipe is unavailable', async () => {
    const setup = setupPipelineChildren();

    setup.firstChild.stderr = null;

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to initialize child process pipes for command pipeline.',
    });
  });

  it('throws CommandPipelineInfrastructureError when the second child stdin pipe is unavailable', async () => {
    const setup = setupPipelineChildren();

    setup.secondChild.stdin = null;

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to initialize child process pipes for command pipeline.',
    });
  });

  it('throws CommandPipelineInfrastructureError when the second child stdout pipe is unavailable', async () => {
    const setup = setupPipelineChildren();

    setup.secondChild.stdout = null;

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to initialize child process pipes for command pipeline.',
    });
  });

  it('throws CommandPipelineInfrastructureError when the second child stderr pipe is unavailable', async () => {
    const setup = setupPipelineChildren();

    setup.secondChild.stderr = null;

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to initialize child process pipes for command pipeline.',
    });
  });

  it('throws CommandPipelineInfrastructureError when the first child process emits an error', async () => {
    const setup = setupPipelineChildren();
    const error = new Error('First child failed to start');

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    setup.firstChild.emit('error', error);
    setup.firstChild.emit('close', null, null);
    setup.secondChild.emit('close', 0, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      CommandPipelineInfrastructureError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to start first command in pipeline: first-command.',
      cause: error,
    });
  });

  it('throws CommandPipelineInfrastructureError when the second child process emits an error', async () => {
    const setup = setupPipelineChildren();
    const error = new Error('Second child failed to start');

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    setup.secondChild.emit('error', error);
    setup.secondChild.emit('close', null, null);
    setup.firstChild.emit('close', 0, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      CommandPipelineInfrastructureError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to start second command in pipeline: second-command.',
      cause: error,
    });
  });

  it('throws CommandPipelineInfrastructureError when capturing a stream fails', async () => {
    const setup = setupPipelineChildren();
    const firstStderr = new PassThrough();
    const error = new Error('Failed to capture stderr');

    setup.firstChild.stderr = firstStderr;

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    firstStderr.emit('error', error);
    setup.firstChild.emit('close', 0, null);
    setup.secondChild.emit('close', 0, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      CommandPipelineInfrastructureError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Failed to capture command pipeline streams.',
      cause: error,
    });
  });

  it('throws SecondPipelineCommandFailedError when the second command exits unsuccessfully', async () => {
    const setup = setupPipelineChildren({
      secondStderr: ['second error line\nsecond error detail'],
    });

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    setup.firstChild.emit('close', 0, null);
    setup.secondChild.emit('close', 2, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      SecondPipelineCommandFailedError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message:
        'Child process "second-command" exited with code 2: second error line',
      commandName: 'second-command',
      status: 2,
      signal: null,
      stderr: 'second error line\nsecond error detail',
    });
  });

  it('throws SecondPipelineCommandFailedError when the second command is terminated by a signal', async () => {
    const setup = setupPipelineChildren({
      secondStderr: ['second error output'],
    });

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    setup.firstChild.emit('close', 0, null);
    setup.secondChild.emit('close', null, 'SIGTERM');

    await expect(resultPromise).rejects.toBeInstanceOf(
      SecondPipelineCommandFailedError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message:
        'Child process "second-command" terminated due to signal SIGTERM.',
      commandName: 'second-command',
      status: null,
      signal: 'SIGTERM',
      stderr: 'second error output',
    });
  });

  it('uses a placeholder when second command stderr capture is disabled', async () => {
    const setup = setupPipelineChildren();

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
      {
        secondStderr: false,
      },
    );

    setup.firstChild.emit('close', 0, null);
    setup.secondChild.emit('close', 2, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      SecondPipelineCommandFailedError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message:
        'Child process "second-command" exited with code 2: [stderr output not captured]',
      commandName: 'second-command',
      status: 2,
      signal: null,
      stderr: '',
    });
  });

  it('throws FirstPipelineCommandFailedError when the first command exits unsuccessfully', async () => {
    const setup = setupPipelineChildren({
      firstStderr: ['first error line\nfirst error detail'],
    });

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    setup.firstChild.emit('close', 3, null);
    setup.secondChild.emit('close', 0, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      FirstPipelineCommandFailedError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message:
        'Child process "first-command" exited with code 3: first error line',
      commandName: 'first-command',
      status: 3,
      signal: null,
      stderr: 'first error line\nfirst error detail',
    });
  });

  it('throws FirstPipelineCommandFailedError when the first command is terminated by a signal', async () => {
    const setup = setupPipelineChildren({
      firstStderr: ['first error output'],
    });

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    setup.firstChild.emit('close', null, 'SIGTERM');
    setup.secondChild.emit('close', 0, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      FirstPipelineCommandFailedError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message:
        'Child process "first-command" terminated due to signal SIGTERM.',
      commandName: 'first-command',
      status: null,
      signal: 'SIGTERM',
      stderr: 'first error output',
    });
  });

  it('uses an unknown signal when the first command terminates without a signal', async () => {
    const setup = setupPipelineChildren({
      firstStderr: ['first error output'],
    });

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    setup.firstChild.emit('close', null, null);
    setup.secondChild.emit('close', 0, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      FirstPipelineCommandFailedError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message:
        'Child process "first-command" terminated due to signal unknown.',
      commandName: 'first-command',
      status: null,
      signal: null,
      stderr: 'first error output',
    });
  });

  it('uses a placeholder when first command stderr capture is disabled', async () => {
    const setup = setupPipelineChildren();

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
      {
        firstStderr: false,
      },
    );

    setup.firstChild.emit('close', 3, null);
    setup.secondChild.emit('close', 0, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      FirstPipelineCommandFailedError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message:
        'Child process "first-command" exited with code 3: [stderr output not captured]',
      commandName: 'first-command',
      status: 3,
      signal: null,
      stderr: '',
    });
  });

  it('throws CommandPipelineInfrastructureError when the stream pipeline fails', async () => {
    const firstStdout = Readable.from(['first output']);
    const secondStdin = new Writable({
      write(_chunk, _encoding, callback): void {
        callback(new Error('Pipe failed'));
      },
    });

    const firstChild = createMockChildProcess({
      stdout: firstStdout,
      stderr: Readable.from([]),
      stdin: null,
    });

    const secondChild = createMockChildProcess({
      stdout: Readable.from([]),
      stderr: Readable.from([]),
      stdin: secondStdin,
    });

    mockedSpawn
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);

    const resultPromise = executeCommandPipeline(
      {
        commandName: 'first-command',
        args: [],
      },
      {
        commandName: 'second-command',
        args: [],
      },
    );

    firstChild.emit('close', 0, null);
    secondChild.emit('close', 0, null);

    await expect(resultPromise).rejects.toBeInstanceOf(
      CommandPipelineInfrastructureError,
    );

    await expect(resultPromise).rejects.toMatchObject({
      message: 'Command pipeline stream execution failed.',
    });
  });
});
