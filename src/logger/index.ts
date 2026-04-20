import process from 'node:process';

import * as winston from 'winston';

import type { LoggerInfo } from './types.js';

const level = process.env.LOG_LEVEL ?? 'debug';

const normalizeError = winston.format((info: LoggerInfo) => {
  const error = info.error;

  if (error instanceof Error) {
    info.errorMessage = error.message;
    info.errorStack = error.stack;
  } else if (typeof error === 'object' && error !== null) {
    try {
      info.errorMessage = JSON.stringify(error);
    } catch {
      info.errorMessage = '[Unserializable object]';
    }
  } else if (error !== undefined) {
    info.errorMessage = String(error);
  }

  return info;
});

const consoleFormat = winston.format.combine(
  normalizeError(),

  winston.format.printf((info: LoggerInfo) => {
    const message = String(info.message);

    return info.errorMessage ? `${message}: ${info.errorMessage}` : message;
  }),

  winston.format.colorize({ all: true }),
);

const fileErrorFormat = winston.format.combine(
  // Human-readable local timestamp with timezone offset for error logs
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss (Z)' }),

  normalizeError(),

  winston.format.printf((info: LoggerInfo) => {
    const timestamp = info.timestamp ?? '';
    const levelName = info.level.toUpperCase();
    const message = String(info.message);
    const base = `${timestamp} ${levelName}: ${message}`;
    const errorMessage = info.errorMessage;
    const errorStack = info.errorStack;

    if (errorStack) {
      return `${base}: ${errorMessage}\n${errorStack}`;
    }

    if (errorMessage) {
      return `${base}: ${errorMessage}`;
    }

    return base;
  }),
);

const options = {
  level,

  transports: [
    new winston.transports.Console({
      level: 'silly',
      format: consoleFormat,
    }),
    new winston.transports.File({
      level: 'error',
      filename: './logs/errors.log',
      format: fileErrorFormat,
    }),
    new winston.transports.File({
      filename: './logs/combined.log',
    }),
  ],

  exceptionHandlers: [
    new winston.transports.File({ filename: './logs/exceptions.log' }),
  ],
};

export default winston.createLogger(options);
