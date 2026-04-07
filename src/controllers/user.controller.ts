import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { UpdateMeInput } from '../schemas/user.schema';
import { buildFileUrl } from '../services/storage.service';

const resolveAvatarUrl = (storagePath: string | null | undefined): string | null =>
  storagePath ? buildFileUrl(storagePath) : null;

const privateUserSelect = {
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
  avatar_media: { select: { storage_path: true } },
  created_at: true,
  updated_at: true,
} as const;

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
        email: true,
        type: true,
        avatar_media: { select: { storage_path: true } },
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

    const { avatar_media, ...rest } = user;

    sendSuccess({
      res,
      status: 200,
      message: 'user.profile_success',
      data: {
        user: {
          ...rest,
          avatar_url: resolveAvatarUrl(avatar_media?.storage_path),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updateMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;
    const body = req.body as UpdateMeInput;

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, email_verified: true, phone: true, phone_verified: true },
    });

    if (!current) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'user.not_found';
      return next(err);
    }

    const emailChanged = body.email !== current.email;
    const phoneChanged = body.phone !== current.phone;

    if (emailChanged && current.email_verified) {
      const err: AppError = new Error();
      err.statusCode = 409;
      err.messageKey = 'user.email_change_not_allowed';
      return next(err);
    }

    if (phoneChanged && current.phone_verified && current.phone !== null) {
      const err: AppError = new Error();
      err.statusCode = 409;
      err.messageKey = 'user.phone_change_not_allowed';
      return next(err);
    }

    if (emailChanged) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true },
      });
      if (emailTaken) {
        const err: AppError = new Error();
        err.statusCode = 409;
        err.messageKey = 'user.email_already_in_use';
        return next(err);
      }
    }

    if (body.phone) {
      const phoneTaken = await prisma.user.findUnique({
        where: { phone: body.phone },
        select: { id: true },
      });
      if (phoneTaken && phoneTaken.id !== userId) {
        const err: AppError = new Error();
        err.statusCode = 409;
        err.messageKey = 'user.phone_already_in_use';
        return next(err);
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        first_name: body.first_name,
        last_name: body.last_name,
        birthday: new Date(body.birthday),
        country: body.country,
        country_prefix: body.country_prefix,
        email: body.email,
        phone: body.phone,
        ...(emailChanged && { email_verified: false }),
      },
      select: privateUserSelect,
    });

    const { avatar_media, ...rest } = updated;

    sendSuccess({
      res,
      status: 200,
      message: 'user.update_success',
      data: {
        user: {
          ...rest,
          avatar_url: resolveAvatarUrl(avatar_media?.storage_path),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const searchUsoUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = ((req.query['q'] as string) ?? '').trim();
    const excludeId = req.user.sub;

    if (query.length < 2) {
      sendSuccess({ res, status: 200, message: 'user.search', data: { users: [] } });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        type: 'uso',
        id: { not: excludeId },
        OR: [
          { first_name: { contains: query, mode: 'insensitive' } },
          { last_name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        avatar_media: { select: { storage_path: true } },
      },
      take: 10,
    });

    sendSuccess({
      res,
      status: 200,
      message: 'user.search',
      data: {
        users: users.map(({ avatar_media, ...u }) => ({
          ...u,
          avatar_url: resolveAvatarUrl(avatar_media?.storage_path),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};
