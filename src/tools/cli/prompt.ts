import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/**
 * Prompts the user for input in the terminal and returns the trimmed response.
 * 
 * Displays the question, waits for user input, and handles Ctrl+C gracefully.
 * 
 * @param question - The question/prompt to display to the user
 * @returns User input as trimmed string (without trailing newline)
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
