import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

/**
 * Logs every HTTP request after the response is finished.
 *
 * Format:
 *   METHOD /path STATUS DURATIONms — IP  [user_id?]
 *
 * Example:
 *   POST /api/v1/auth/login 200 42ms — ::1
 *   GET  /api/v1/auth/me    401 5ms  — ::1  [userId: abc123]
 */
export const httpLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const method   = req.method.padEnd(6);
    const url      = req.originalUrl;
    const status   = res.statusCode;
    const ip       = req.ip ?? req.socket?.remoteAddress ?? '-';
    const userId   = req.user?.sub ? `  [userId: ${req.user.sub}]` : '';

    const message = `${method} ${url} ${status} ${duration}ms — ${ip}${userId}`;

    // Route to appropriate log level based on status code
    if (status >= 500) {
      logger.error(message);
    } else if (status >= 400) {
      logger.warn(message);
    } else {
      logger.http(message);
    }
  });

  next();
};
