import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';

export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = req.params['id'] as string;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        birthday: true,
        phone: true,
        country: true,
        country_prefix: true,
        email: true,
        type: true,
        phone_verified: true,
        email_verified: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'user.not_found';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'user.profile_success', data: { user } });
  } catch (err) {
    next(err);
  }
};
