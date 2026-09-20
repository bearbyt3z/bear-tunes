import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CommandExecutionFailedError,
  CommandExecutionStartError,
} from './command.errors.js';

import {
  executeCommandSync,
} from '#tools';

const { mockedSpawnSync } = vi.hoisted(() => ({
  mockedSpawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: mockedSpawnSync,
}));

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
