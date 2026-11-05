import { expect } from 'vitest';

type WarningCall = readonly [
  message: string,
  context: Record<string, unknown>,
];

export function getLoggedWarningContext(
  calls: readonly WarningCall[],
  expectedMessage: string,
): Record<string, unknown> {
  expect(calls).toHaveLength(1);

  const warningCall = calls[0];

  if (warningCall === undefined) {
    throw new Error('Expected logger.warn to be called.');
  }

  const [message, context] = warningCall;

  expect(message).toBe(expectedMessage);

  return context;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value);
}

export function getFirstLoggedIssue(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const issues: unknown = context.issues;

  if (!Array.isArray(issues)) {
    throw new Error('Expected logger context to contain an issues array.');
  }

  const firstIssue: unknown = issues[0];

  if (!isRecord(firstIssue)) {
    throw new Error('Expected the first validation issue to be an object.');
  }

  return firstIssue;
}
