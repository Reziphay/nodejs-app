import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { UpdateMeInput } from '../schemas/user.schema';
import { buildFileUrl } from '../services/storage.service';

const resolveAvatarUrl = (storagePath: string | null | undefined): string | null =>
  storagePath ? buildFileUrl(storagePath) : null;

function normalizePhoneQuery(value: string): string {
  return value.replace(/\D/g, '');
}

function requireUso(req: Request, next: NextFunction): boolean {
  if (req.user.type !== 'uso') {
    const err: AppError = new Error();
    err.statusCode = 403;
    err.messageKey = 'errors.forbidden';
    next(err);
    return false;
  }

  return true;
}

const privateUserSelect = {
  id: true,
  first_name: true,
  last_name: true,
  birthday: true,
  phone: true,      // full E.164, e.g. "+9941234567"
  country: true,
  email: true,
  type: true,
  phone_verified: true,
  email_verified: true,
  instagram_url: true,
  facebook_url: true,
  youtube_url: true,
  whatsapp_url: true,
  linkedin_url: true,
  x_url: true,
  website_url: true,
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
        instagram_url: true,
        facebook_url: true,
        youtube_url: true,
        whatsapp_url: true,
        linkedin_url: true,
        x_url: true,
        website_url: true,
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

    const { avatar_media, instagram_url, facebook_url, youtube_url, whatsapp_url, linkedin_url, x_url, website_url, ...rest } = user;

    sendSuccess({
      res,
      status: 200,
      message: 'user.profile_success',
      data: {
        user: {
          ...rest,
          avatar_url: resolveAvatarUrl(avatar_media?.storage_path),
          ...(instagram_url && { instagram_url }),
          ...(facebook_url && { facebook_url }),
          ...(youtube_url && { youtube_url }),
          ...(whatsapp_url && { whatsapp_url }),
          ...(linkedin_url && { linkedin_url }),
          ...(x_url && { x_url }),
          ...(website_url && { website_url }),
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

    // body.phone is already a full E.164 string (e.g. "+9941234567") or null.
    // The frontend combines the prefix and local number before sending; the
    // backend stores the value directly — no further manipulation needed.
    const newPhone = body.phone ?? null;

    const emailChanged = body.email !== current.email;
    const phoneChanged = newPhone !== current.phone;

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

    // Uniqueness check on the full E.164 number — not just the local part.
    if (newPhone) {
      const phoneTaken = await prisma.user.findUnique({
        where: { phone: newPhone },
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
        email: body.email,
        phone: newPhone,
        ...(emailChanged && { email_verified: false }),
        ...(phoneChanged && { phone_verified: false }),
        ...(body.instagram_url !== undefined && { instagram_url: body.instagram_url }),
        ...(body.facebook_url !== undefined && { facebook_url: body.facebook_url }),
        ...(body.youtube_url !== undefined && { youtube_url: body.youtube_url }),
        ...(body.whatsapp_url !== undefined && { whatsapp_url: body.whatsapp_url }),
        ...(body.linkedin_url !== undefined && { linkedin_url: body.linkedin_url }),
        ...(body.x_url !== undefined && { x_url: body.x_url }),
        ...(body.website_url !== undefined && { website_url: body.website_url }),
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
    if (!requireUso(req, next)) return;

    const query = ((req.query['q'] as string) ?? '').trim();
    const excludeId = req.user.sub;
    const normalizedPhoneQuery = normalizePhoneQuery(query);
    const canSearchByText = query.length >= 2 && /[^\d\s()+-]/.test(query);
    const canSearchByPhone = normalizedPhoneQuery.length >= 4;

    if (!canSearchByText && !canSearchByPhone) {
      sendSuccess({ res, status: 200, message: 'user.search', data: { users: [] } });
      return;
    }

    const usersById = new Map<
      string,
      {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        avatar_url: string | null;
      }
    >();

    if (canSearchByText) {
      const textUsers = await prisma.user.findMany({
        where: {
          type: 'uso',
          id: { not: excludeId },
          OR: [
            { first_name: { contains: query, mode: 'insensitive' } },
            { last_name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
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

      for (const user of textUsers) {
        usersById.set(user.id, {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          avatar_url: resolveAvatarUrl(user.avatar_media?.storage_path),
        });
      }
    }

    if (canSearchByPhone && usersById.size < 10) {
      // phone now stores the full E.164 number (e.g. "+9941234567").
      // Strip non-digits from the stored number before comparing so the user
      // can search by digits only without worrying about the leading '+'.
      const phoneUsers = await prisma.$queryRaw<
        {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          avatar_storage_path: string | null;
        }[]
      >`
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          m.storage_path AS avatar_storage_path
        FROM "User" u
        LEFT JOIN "Media" m ON m.id = u.avatar_media_id
        WHERE u.type = CAST('uso' AS "UserType")
          AND u.id <> ${excludeId}
          AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g')
            LIKE ${`%${normalizedPhoneQuery}%`}
        ORDER BY u.first_name ASC, u.last_name ASC
        LIMIT ${10 - usersById.size}
      `;

      for (const user of phoneUsers) {
        usersById.set(user.id, {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          avatar_url: resolveAvatarUrl(user.avatar_storage_path),
        });
      }
    }

    sendSuccess({
      res,
      status: 200,
      message: 'user.search',
      data: {
        users: Array.from(usersById.values()).slice(0, 10),
      },
    });
  } catch (err) {
    next(err);
  }
};
