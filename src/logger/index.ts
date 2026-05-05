import process from 'node:process';

import * as winston from 'winston';

import type {
  LoggerInfo,
  LoggerValue,
} from './types.js';

const level = process.env.LOG_LEVEL ?? 'debug';

/**
 * Serializes a log value into a readable string for console and file output.
 *
 * `Error` values prefer stack traces, strings are returned as-is, and all
 * remaining values are serialized via `JSON.stringify()` when possible.
 *
 * @param value - Value attached to the log record.
 * @returns Human-readable string representation.
 */
function stringifyLogValue(value: LoggerValue): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return String(value);
  }

  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '[Unserializable value]';
  }
}

/**
 * Type guard for non-null object values used during defensive log normalization.
 *
 * @param value - Unknown value to inspect.
 * @returns `true` when the value is an object and not `null`.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks whether a value can be preserved inside structured logger metadata.
 *
 * @param value - Unknown value to inspect.
 * @returns `true` when the value matches {@link LoggerValue}.
 */
function isLoggerValue(value: unknown): value is LoggerValue {
  return (
    value instanceof Error
    || value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
    || typeof value === 'symbol'
    || typeof value === 'object'
  );
}

/**
 * Collects non-reserved logger fields into a typed metadata object without
 * using type assertions.
 *
 * Undefined values and reserved internal logger fields are skipped.
 *
 * @param info - Winston log payload.
 * @param excludedKeys - Keys reserved for internal logger processing.
 * @returns Structured metadata object or `undefined` when empty.
 */
function buildMetadata(
  info: LoggerInfo,
  excludedKeys: ReadonlySet<string>,
): Record<string, LoggerValue> | undefined {
  const metadata: Record<string, LoggerValue> = {};

  for (const [key, value] of Object.entries(info)) {
    if (excludedKeys.has(key) || value === undefined) {
      continue;
    }

    if (isLoggerValue(value)) {
      metadata[key] = value;
    }
  }

  return Object.keys(metadata).length > 0
    ? metadata
    : undefined;
}

/**
 * Formats a validation issue path into a dot-separated string.
 *
 * Supported inputs:
 * - array paths such as `['release', 0, 'id']`
 * - scalar paths such as `'release.id'` or `0`
 *
 * Unsupported values return `undefined` to avoid unsafe base stringification.
 *
 * @param path - Unknown path value from a validation issue.
 * @returns Dot-separated path string or `undefined`.
 */
function formatIssuePath(path: unknown): string | undefined {
  if (Array.isArray(path)) {
    const segments = path.filter((segment): segment is string | number => (
      typeof segment === 'string' || typeof segment === 'number'
    ));

    return segments.length > 0
      ? segments.map(String).join('.')
      : undefined;
  }

  if (typeof path === 'string' || typeof path === 'number') {
    return String(path);
  }

  return undefined;
}

/**
 * Converts an unknown validation issues payload into a readable list of lines.
 *
 * The function is designed mainly for Zod-like issues but remains defensive
 * when receiving malformed or unexpected values.
 *
 * @param value - Unknown issues payload attached to log metadata.
 * @returns Array of formatted issue lines.
 */
function formatIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((issue, index) => {
    if (!isRecord(issue)) {
      return `${index + 1}. [Invalid issue payload]`;
    }

    const path = formatIssuePath(issue.path);
    const code = typeof issue.code === 'string'
      ? issue.code
      : 'unknown';
    const message = typeof issue.message === 'string'
      ? issue.message
      : 'Unknown validation error';

    return path
      ? `${index + 1}. ${path} (${code}): ${message}`
      : `${index + 1}. ${code}: ${message}`;
  });
}

/**
 * Winston format that moves non-reserved top-level log fields into a dedicated
 * `metadata` object used by the multiline renderer.
 */
const normalizeError = winston.format((info: LoggerInfo) => {
  const error = info.error;

  if (error instanceof Error) {
    info.errorMessage = error.message;
    info.errorStack = error.stack;
  } else if (error !== undefined) {
    info.errorMessage = stringifyLogValue(error);
  }

  return info;
});

/**
 * Winston format that collects all non-reserved properties from the log record
 * into a dedicated `metadata` object.
 *
 * This keeps rendering logic simple and avoids coupling output formatting to
 * ad-hoc top-level fields.
 */
const collectMetadata = winston.format((info: LoggerInfo) => {
  const excludedKeys = new Set([
    'level',
    'message',
    'timestamp',
    'label',
    'error',
    'errorMessage',
    'errorStack',
    'metadata',
    'splat',
  ]);

  info.metadata = buildMetadata(info, excludedKeys);

  return info;
});

/**
 * Builds the first line of the rendered log block.
 *
 * File transports include a timestamp, while console output typically keeps
 * the headline shorter and relies on color for fast scanning.
 *
 * @param message - Main log message.
 * @param timestamp - Optional timestamp prefix.
 * @returns Header line.
 */
function renderHeader(message: string, timestamp?: string): string {
  return timestamp
    ? `${timestamp} ${message}`
    : message;
}

/**
 * Renders a single top-level metadata line attached to the main log message.
 *
 * Example:
 * `└─ trackUrl: "https://example.com"`
 *
 * @param label - Metadata field name.
 * @param value - Preformatted metadata value.
 * @returns Rendered metadata line.
 */
function renderFieldLine(label: string, value: string): string {
  return `└─ ${label}: ${value}`;
}

/**
 * Renders a titled nested list section.
 *
 * Example:
 * `└─ issues:`
 * `  └─ 1. field (invalid_type): ...`
 *
 * @param title - Section title.
 * @param items - Section item lines.
 * @returns Rendered section lines.
 */
function renderSectionLines(title: string, items: string[]): string[] {
  if (items.length === 0) {
    return [];
  }

  return [
    `└─ ${title}:`,
    ...items.map((item) => `  └─ ${item}`),
  ];
}

/**
 * Renders an indented multiline block, intended primarily for stack traces.
 *
 * Stack traces read better as a text block than as a nested tree of bullet-like
 * entries, so the function uses indentation without repeating `└─` on each line.
 *
 * @param title - Section title.
 * @param lines - Raw lines to indent.
 * @returns Rendered block lines.
 */
function renderIndentedBlock(title: string, lines: string[]): string[] {
  if (lines.length === 0) {
    return [];
  }

  return [
    `└─ ${title}:`,
    ...lines.map((line) => `    ${line}`),
  ];
}

/**
 * Renders a complete multiline log block.
 *
 * Layout:
 * - headline
 * - top-level metadata fields
 * - optional `issues` section
 * - optional `error` or `stack` section
 *
 * @param info - Winston log payload after normalization.
 * @param withTimestamp - Whether the header should include a timestamp.
 * @returns Final multiline log string.
 */
function renderLog(info: LoggerInfo, withTimestamp: boolean): string {
  const lines: string[] = [
    renderHeader(
      String(info.message),
      withTimestamp ? info.timestamp : undefined,
    ),
  ];

  const metadata = info.metadata ?? {};
  const { issues, ...restMetadata } = metadata;

  const metadataLines = Object.entries(restMetadata)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => renderFieldLine(key, stringifyLogValue(value)));

  const issueLines = renderSectionLines('issues', formatIssues(issues));

  const errorLines = info.errorStack
    ? renderIndentedBlock('stack', info.errorStack.split('\n'))
    : info.errorMessage
      ? renderSectionLines('error', [info.errorMessage])
      : [];

  lines.push(...metadataLines);
  lines.push(...issueLines);
  lines.push(...errorLines);

  return lines.join('\n');
}

/**
 * Console formatter optimized for readable CLI output.
 *
 * The final rendered block is colorized as a whole based on the log level.
 */
const consoleFormat = winston.format.combine(
  normalizeError(),
  collectMetadata(),
  winston.format.printf((info: LoggerInfo) => renderLog(info, false)),
  winston.format.colorize({ all: true }),
);

/**
 * File formatter optimized for human-readable persisted logs.
 *
 * Includes timestamp information and uses the same structural rendering as the
 * console formatter for consistency across transports.
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss (Z)' }),
  normalizeError(),
  collectMetadata(),
  winston.format.printf((info: LoggerInfo) => renderLog(info, true)),
);

/**
 * Shared Winston logger configuration.
 *
 * - Console transport is verbose and colorized for CLI usage.
 * - Combined file stores all messages.
 * - Error file stores error-level logs only.
 * - Exception handler writes uncaught exceptions into a dedicated file.
 */
const options = {
  level,
  transports: [
    new winston.transports.Console({
      level: 'silly',
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: './logs/combined.log',
      format: fileFormat,
    }),
    new winston.transports.File({
      level: 'error',
      filename: './logs/errors.log',
      format: fileFormat,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: './logs/exceptions.log',
      format: fileFormat,
    }),
  ],
};

export default winston.createLogger(options);
