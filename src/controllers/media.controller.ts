import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { validateAndProcessImage, writeFileToDisk } from '../services/media.service';
import {
  buildStoragePath,
  ensureUserStorageDir,
  buildFileUrl,
  deleteFile,
} from '../services/storage.service';

export const uploadAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;

    if (!req.file) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'media.no_file_provided';
      return next(err);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'user.not_found';
      return next(err);
    }

    const validated = await validateAndProcessImage(req.file);

    await ensureUserStorageDir(userId);
    const storagePath = buildStoragePath(userId, 'webp');
    await writeFileToDisk(storagePath, validated.buffer);

    const media = await prisma.media.create({
      data: {
        name: req.file.originalname,
        format: validated.format,
        mime_type: validated.mimeType,
        size: validated.size,
        kind: 'avatar',
        storage_path: storagePath,
        checksum: validated.checksum,
        is_public: true,
        owner_id: userId,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { avatar_media_id: media.id },
    });

    const avatarUrl = buildFileUrl(storagePath);

    sendSuccess({
      res,
      status: 201,
      message: 'media.avatar_upload_success',
      data: { avatar_url: avatarUrl },
    });
  } catch (err) {
    next(err);
  }
};

export const uploadBrandMedia = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;

    if (!req.file) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'media.no_file_provided';
      return next(err);
    }

    const validated = await validateAndProcessImage(req.file);

    await ensureUserStorageDir(userId);
    const storagePath = buildStoragePath(userId, 'webp');
    await writeFileToDisk(storagePath, validated.buffer);

    const media = await prisma.media.create({
      data: {
        name: req.file.originalname,
        format: validated.format,
        mime_type: validated.mimeType,
        size: validated.size,
        kind: 'other',
        storage_path: storagePath,
        checksum: validated.checksum,
        is_public: true,
        owner_id: userId,
      },
    });

    sendSuccess({
      res,
      status: 201,
      message: 'media.brand_upload_success',
      data: { media_id: media.id, url: buildFileUrl(storagePath) },
    });
  } catch (err) {
    next(err);
  }
};

export const removeAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        avatar_media_id: true,
        avatar_media: { select: { id: true, storage_path: true } },
      },
    });

    if (!user) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'user.not_found';
      return next(err);
    }

    if (user.avatar_media) {
      await prisma.user.update({
        where: { id: userId },
        data: { avatar_media_id: null },
      });

      await prisma.media.delete({ where: { id: user.avatar_media.id } });

      await deleteFile(user.avatar_media.storage_path);
    }

    sendSuccess({
      res,
      status: 200,
      message: 'media.avatar_remove_success',
      data: { avatar_url: null },
    });
  } catch (err) {
    next(err);
  }
};
