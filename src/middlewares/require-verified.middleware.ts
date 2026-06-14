import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from './error.middleware';

/**
 * Blocks the action unless the authenticated user's email AND phone are both
 * verified. Used to gate brand/service creation behind account verification.
 */
export const requireVerifiedAccount = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { email_verified: true, phone_verified: true },
    });

    if (!user || !user.email_verified || !user.phone_verified) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'errors.account_not_verified';
      return next(err);
    }

    next();
  } catch (error) {
    next(error);
  }
};
