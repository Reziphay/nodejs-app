import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';
import { sendError } from '../utils/response';

export interface AppError extends Error {
  statusCode?: number;
  messageKey?: string;
  errors?: { field: string; message: string }[];
  details?: unknown;
}

export const errorMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const status  = err.statusCode ?? 500;
  const message = err.messageKey ?? 'errors.internal_server_error';

  const context = `${req.method} ${req.originalUrl} → ${status} [${message}]`;

  if (status >= 500) {
    // Log full stack for server errors
    logger.error(`${context}\n${err.stack ?? err.message}`);
  } else {
    // Client errors are expected — warn level, no stack trace
    logger.warn(context);
  }

  sendError({ res, status, message, errors: err.errors, data: err.details });
};
