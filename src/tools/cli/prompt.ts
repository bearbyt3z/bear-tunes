import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/**
 * Prompts the user for input in the terminal and returns the trimmed response.
 *
 * The question is displayed using a readline interface connected to the
 * process standard input and output. Leading and trailing whitespace is
 * removed from the response.
 *
 * The readline interface is closed after the question completes, including
 * when the question fails.
 *
 * @param question - The question or prompt to display to the user.
 * @returns User input with leading and trailing whitespace removed.
 * @throws If reading the user input fails.
 *
 * @example
 * ```ts
 * const answer = await prompt('Proceed? (y/n): ');
 * if (answer === 'y') { ... }
 * ```
 */
export async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}
