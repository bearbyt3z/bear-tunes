'use strict';


// TODO: CREATE DIRECTORIES FOR LOGS !!!!!!!!!!!!!


const winston = require('winston');
const process = require('process');
const fs = require('fs');

const level = process.env.LOG_LEVEL || 'debug';
const colorizer = winston.format.colorize();

// const loggerFormat = winston.format.printf(({ level, message, timestamp }) => {
//     // return `${new Date(timestamp).toLocaleTimeString()} ${level.toUpperCase()}: ${message}`;
//     return `${timestamp} ${level.toUpperCase()}: ${message}`;
// });

const options = {
    level: level,
    // format: winston.format.json(),
    transports: [
        new winston.transports.Console({
            level: 'info',
            format: winston.format.combine(
                // winston.format.printf(info => `${info.level.toUpperCase()}: ${info.message}`),
                winston.format.printf(info => info.message),
                winston.format.colorize({ all: true }),
            ),
        }),
        new winston.transports.File({
            level: 'error',
            filename: './logs/errors.log',
            format: winston.format.combine(
                // winston.format.label({ label: 'right meow!' }),
                // winston.format.simple(),
                // winston.format.prettyPrint(),
                // // winston.format.json(),
                // winston.format.align(),
                winston.format.timestamp({ format: 'YY.MM.DD HH:MM:SS' }),
                winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`),
                // winston.format.colorize({ all: true }),
            )
        }),
        new winston.transports.File({ filename: './logs/combined.log' }),
    ],
    exceptionHandlers: [
        new winston.transports.File({ filename: './logs/exceptions.log' })
    ],
}

// winston.addColors({
//     error: 'red',
//     warn: 'yellow',
//     info: 'cyan',
//     debug: 'green'
// });

module.exports = winston.createLogger(options);
