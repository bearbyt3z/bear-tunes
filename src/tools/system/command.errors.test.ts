import { describe, expect, it } from 'vitest';

import {
  CommandExecutionFailedError,
  CommandExecutionStartError,
  CommandPipelineInfrastructureError,
  FirstPipelineCommandFailedError,
  SecondPipelineCommandFailedError,
} from './command.errors.js';

describe('CommandExecutionStartError', () => {
  it('creates an error with the expected message and name', () => {
    const cause = new Error('ENOENT');
    const error = new CommandExecutionStartError('/usr/bin/example', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CommandExecutionStartError');
    expect(error.message).toBe(
      'Failed to start child process "/usr/bin/example".',
    );
  });

  it('stores the command name', () => {
    const cause = new Error('ENOENT');
    const error = new CommandExecutionStartError('/usr/bin/example', cause);

    expect(error.commandName).toBe('/usr/bin/example');
  });

  it('preserves the original error as the cause', () => {
    const cause = new Error('ENOENT');
    const error = new CommandExecutionStartError('/usr/bin/example', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('CommandExecutionFailedError', () => {
  it('creates an error with the expected message, name, and process details', () => {
    const stdout = Buffer.from('command output');
    const stderr = Buffer.from('command error');

    const error = new CommandExecutionFailedError(
      'Command failed.',
      '/usr/bin/example',
      1,
      null,
      stdout,
      stderr,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CommandExecutionFailedError');
    expect(error.message).toBe('Command failed.');
    expect(error.commandName).toBe('/usr/bin/example');
    expect(error.status).toBe(1);
    expect(error.signal).toBeNull();
    expect(error.stdout).toBe(stdout);
    expect(error.stderr).toBe(stderr);
  });

  it('stores null signal and undefined output streams', () => {
    const error = new CommandExecutionFailedError(
      'Command terminated by signal.',
      'example',
      null,
      'SIGTERM',
      undefined,
      undefined,
    );

    expect(error.status).toBeNull();
    expect(error.signal).toBe('SIGTERM');
    expect(error.stdout).toBeUndefined();
    expect(error.stderr).toBeUndefined();
  });
});

describe('CommandPipelineInfrastructureError', () => {
  it('creates an error with a message and cause', () => {
    const cause = new Error('Failed to start process');
    const error = new CommandPipelineInfrastructureError(
      'Failed to start command pipeline.',
      cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CommandPipelineInfrastructureError');
    expect(error.message).toBe('Failed to start command pipeline.');
    expect(error.cause).toBe(cause);
  });

  it('creates an error without a cause', () => {
    const error = new CommandPipelineInfrastructureError(
      'Failed to initialize command pipeline.',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CommandPipelineInfrastructureError');
    expect(error.message).toBe('Failed to initialize command pipeline.');
    expect(error.cause).toBeUndefined();
  });
});

describe('FirstPipelineCommandFailedError', () => {
  it('creates an error with the expected message and process details', () => {
    const error = new FirstPipelineCommandFailedError(
      'First command failed.',
      '/usr/bin/first-command',
      1,
      null,
      'Command error output',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FirstPipelineCommandFailedError');
    expect(error.message).toBe('First command failed.');
    expect(error.commandName).toBe('/usr/bin/first-command');
    expect(error.status).toBe(1);
    expect(error.signal).toBeNull();
    expect(error.stderr).toBe('Command error output');
  });

  it('preserves signal termination details', () => {
    const error = new FirstPipelineCommandFailedError(
      'First command terminated.',
      'first-command',
      null,
      'SIGTERM',
      '',
    );

    expect(error.status).toBeNull();
    expect(error.signal).toBe('SIGTERM');
    expect(error.stderr).toBe('');
  });
});

describe('SecondPipelineCommandFailedError', () => {
  it('creates an error with the expected message and process details', () => {
    const error = new SecondPipelineCommandFailedError(
      'Second command failed.',
      '/usr/bin/second-command',
      1,
      null,
      'Command error output',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SecondPipelineCommandFailedError');
    expect(error.message).toBe('Second command failed.');
    expect(error.commandName).toBe('/usr/bin/second-command');
    expect(error.status).toBe(1);
    expect(error.signal).toBeNull();
    expect(error.stderr).toBe('Command error output');
  });

  it('preserves signal termination details', () => {
    const error = new SecondPipelineCommandFailedError(
      'Second command terminated.',
      'second-command',
      null,
      'SIGTERM',
      '',
    );

    expect(error.status).toBeNull();
    expect(error.signal).toBe('SIGTERM');
    expect(error.stderr).toBe('');
  });
});
