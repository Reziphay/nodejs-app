import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from './error.middleware';

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    const err: AppError = new Error();
    err.statusCode = 401;
    err.messageKey = 'errors.missing_token';
    return next(err);
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    const err: AppError = new Error();
    err.statusCode = 401;
    err.messageKey = 'errors.invalid_token';
    next(err);
  }
};

export const authenticateOptional = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return next();
  }

  if (!authHeader.startsWith('Bearer ')) {
    const err: AppError = new Error();
    err.statusCode = 401;
    err.messageKey = 'errors.invalid_token';
    return next(err);
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    const err: AppError = new Error();
    err.statusCode = 401;
    err.messageKey = 'errors.invalid_token';
    next(err);
  }
};
