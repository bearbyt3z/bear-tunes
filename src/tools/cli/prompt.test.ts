import { stdin, stdout } from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import { prompt } from '#tools';

const { mockedReadline, mockedCreateInterface } = vi.hoisted(() => {
  const mockedReadline = {
    question: vi.fn(),
    close: vi.fn(),
  };

  const mockedCreateInterface = vi.fn(() => mockedReadline);

  return {
    mockedReadline,
    mockedCreateInterface,
  };
});

vi.mock('node:readline/promises', () => ({
  createInterface: mockedCreateInterface,
}));

describe('prompt', () => {
  it('returns the trimmed user input', async () => {
    mockedReadline.question.mockResolvedValueOnce('  yes  ');

    await expect(prompt('Proceed? ')).resolves.toBe('yes');
  });

  it('removes leading and trailing whitespace while preserving internal whitespace', async () => {
    mockedReadline.question.mockResolvedValueOnce('  hello   world  ');

    await expect(prompt('Enter text: ')).resolves.toBe('hello   world');
  });

  it('returns an empty string when the user enters only whitespace', async () => {
    mockedReadline.question.mockResolvedValueOnce('  \t\n  ');

    await expect(prompt('Enter text: ')).resolves.toBe('');
  });

  it('passes the question to the readline interface', async () => {
    mockedReadline.question.mockResolvedValueOnce('yes');

    await prompt('Proceed? ');

    expect(mockedReadline.question).toHaveBeenCalledWith('Proceed? ');
    expect(mockedReadline.question).toHaveBeenCalledTimes(1);
  });

  it('creates the readline interface with standard input and output', async () => {
    mockedReadline.question.mockResolvedValueOnce('yes');

    await prompt('Proceed? ');

    expect(mockedCreateInterface).toHaveBeenCalledWith({
      input: stdin,
      output: stdout,
    });
    expect(mockedCreateInterface).toHaveBeenCalledTimes(1);
  });

  it('closes the readline interface after receiving the answer', async () => {
    mockedReadline.question.mockResolvedValueOnce('yes');

    await prompt('Proceed? ');

    expect(mockedReadline.close).toHaveBeenCalledTimes(1);
  });

  it('closes the readline interface when reading fails', async () => {
    const error = new Error('Input failed');

    mockedReadline.question.mockRejectedValueOnce(error);

    await expect(prompt('Proceed? ')).rejects.toBe(error);

    expect(mockedReadline.close).toHaveBeenCalledTimes(1);
  });
});
