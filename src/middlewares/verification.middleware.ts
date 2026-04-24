import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from './error.middleware';
import { getRestrictionState } from '../services/auth/auth-policy.service';

export const requireFullyVerified = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true,
        email_verified: true,
        phone_verified: true,
      },
    });

    if (!user) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'auth.user_not_found';
      return next(err);
    }

    const restrictionState = getRestrictionState(user);

    if (restrictionState.is_restricted) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'auth.verification_required';
      err.details = { restriction_state: restrictionState };
      return next(err);
    }

    next();
  } catch (error) {
    next(error);
  }
};
