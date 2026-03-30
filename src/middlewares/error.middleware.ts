import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export interface AppError extends Error {
  statusCode?: number;
  messageKey?: string;
}

export const errorMiddleware = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const status = err.statusCode ?? 500;
  const message = err.messageKey ?? 'errors.internal_server_error';
  sendError({ res, status, message });
};
