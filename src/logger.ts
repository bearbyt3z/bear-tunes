// TODO: CREATE DIRECTORIES FOR LOGS !!!!!!!!!!!!!

import * as winston from 'winston';
import * as process from 'process';

const level = process.env.LOG_LEVEL || 'debug';

const normalizeError = winston.format((info) => {
  const error = info.error as unknown;

  if (error instanceof Error) {
    info.errorMessage = error.message;
    info.errorStack = error.stack;
  } else if (error !== undefined) {
    info.errorMessage = String(error);
  }

  return info;
});

const consoleFormat = winston.format.combine(
  normalizeError(),

  winston.format.printf((info) => {
    const message = info.message as string;
    const errorMessage = info.errorMessage as string | undefined;

    return errorMessage ? `${message}: ${errorMessage}` : message;
  }),

  winston.format.colorize({ all: true }),
);

const fileErrorFormat = winston.format.combine(
  // Human-readable local timestamp with timezone offset for error logs
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss (Z)' }),

  normalizeError(),

  winston.format.printf((info) => {
    const base = `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`;
    const errorMessage = info.errorMessage as string | undefined;
    const errorStack = info.errorStack as string | undefined;

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
      filename: './logs/combined.log'
    }),
  ],

  exceptionHandlers: [
    new winston.transports.File({ filename: './logs/exceptions.log' }),
  ],
};

module.exports = winston.createLogger(options);
