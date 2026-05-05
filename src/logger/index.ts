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
    if (typeof issue !== 'object' || issue === null) {
      return `${index + 1}. [Invalid issue payload]`;
    }

    const issueRecord = issue as Record<string, unknown>;
    const path = formatIssuePath(issueRecord.path);
    const code = typeof issueRecord.code === 'string'
      ? issueRecord.code
      : 'unknown';
    const message = typeof issueRecord.message === 'string'
      ? issueRecord.message
      : 'Unknown validation error';

    return path
      ? `${index + 1}. ${path} (${code}): ${message}`
      : `${index + 1}. ${code}: ${message}`;
  });
}

/**
 * Winston format that extracts `error.message` and `error.stack` into
 * dedicated fields so later formatters can render them consistently.
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

  const metadataEntries = Object.entries(info).filter(([key, value]) => (
    !excludedKeys.has(key) && value !== undefined
  ));

  info.metadata = metadataEntries.length > 0
    ? Object.fromEntries(metadataEntries) as Record<string, LoggerValue>
    : undefined;

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
