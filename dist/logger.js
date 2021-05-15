'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var winston = require("winston");
var process = require("process");
var level = process.env.LOG_LEVEL || 'debug';
var colorizer = winston.format.colorize();
var options = {
    level: level,
    transports: [
        new winston.transports.Console({
            level: 'info',
            format: winston.format.combine(winston.format.printf(function (info) { return info.message; }), winston.format.colorize({ all: true })),
        }),
        new winston.transports.File({
            level: 'error',
            filename: './logs/errors.log',
            format: winston.format.combine(winston.format.timestamp({ format: 'YY.MM.DD HH:MM:SS' }), winston.format.printf(function (info) { return info.timestamp + " " + info.level.toUpperCase() + ": " + info.message; }))
        }),
        new winston.transports.File({ filename: './logs/combined.log' }),
    ],
    exceptionHandlers: [
        new winston.transports.File({ filename: './logs/exceptions.log' })
    ],
};
module.exports = winston.createLogger(options);
