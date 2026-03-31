import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

// ── Custom levels ────────────────────────────────────────────────────────────
// http sits between info and verbose so HTTP traffic is easy to filter
const levels = {
  error: 0,
  warn:  1,
  info:  2,
  http:  3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn:  'yellow',
  info:  'green',
  http:  'magenta',
  debug: 'cyan',
};

winston.addColors(colors);

// ── Formats ──────────────────────────────────────────────────────────────────
const timestampFmt = winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });

/** For log files: plain readable text, no color codes */
const fileFormat = winston.format.combine(
  timestampFmt,
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    const lvl = level.toUpperCase().padEnd(5);
    return stack
      ? `${timestamp} [${lvl}] ${message}\n${stack}`
      : `${timestamp} [${lvl}] ${message}`;
  }),
);

/** For the console: add colors */
const consoleFormat = winston.format.combine(
  timestampFmt,
  winston.format.colorize({ all: true }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return stack
      ? `${timestamp} ${level} ${message}\n${stack}`
      : `${timestamp} ${level} ${message}`;
  }),
);

// ── Transports ───────────────────────────────────────────────────────────────

/** Rotate daily, keep 14 days — captures everything from http level up */
const combinedRotate = new DailyRotateFile({
  dirname:       LOGS_DIR,
  filename:      'app-%DATE%.log',
  datePattern:   'YYYY-MM-DD',
  maxFiles:      '14d',
  zippedArchive: true,
  level:         'http',
  format:        fileFormat,
});

/** Errors-only file — never rotated, always available for quick inspection */
const errorFile = new winston.transports.File({
  dirname:  LOGS_DIR,
  filename: 'error.log',
  level:    'error',
  format:   fileFormat,
});

/** HTTP-only daily log — exact level filter keeps only access-log entries */
const httpOnlyFilter = winston.format((info) =>
  info.level === 'http' ? info : false,
)();

const httpRotate = new DailyRotateFile({
  dirname:       LOGS_DIR,
  filename:      'http-%DATE%.log',
  datePattern:   'YYYY-MM-DD',
  maxFiles:      '7d',
  zippedArchive: true,
  level:         'http',
  format:        winston.format.combine(httpOnlyFilter, fileFormat),
});

// ── Logger ───────────────────────────────────────────────────────────────────
const isDev = (process.env['NODE_ENV'] ?? 'development') !== 'production';

const logger = winston.createLogger({
  levels,
  level: isDev ? 'debug' : 'http',
  transports: [
    combinedRotate,
    errorFile,
    httpRotate,
    ...(isDev
      ? [new winston.transports.Console({ format: consoleFormat })]
      : []),
  ],
  exitOnError: false,
});

export default logger;
