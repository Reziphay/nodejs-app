import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';

export const healthCheck = (_req: Request, res: Response): void => {
  sendSuccess({ res, status: 200, message: 'health.ok' });
};
