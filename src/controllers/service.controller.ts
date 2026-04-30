import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { buildFileUrl } from '../services/storage.service';
import { validateAndProcessImage, writeFileToDisk } from '../services/media.service';
import { buildStoragePath, ensureUserStorageDir } from '../services/storage.service';
import type { CreateServiceInput, UpdateServiceInput } from '../schemas/service.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function requireOwner(ownerId: string, userId: string, next: NextFunction): boolean {
  if (ownerId !== userId) {
    const err: AppError = new Error();
    err.statusCode = 403;
    err.messageKey = 'service.not_owner';
    next(err);
    return false;
  }
  return true;
}

async function validateMediaOwnership(
  mediaIds: string[],
  userId: string,
  next: NextFunction,
): Promise<boolean> {
  if (mediaIds.length === 0) return true;
  const medias = await prisma.media.findMany({
    where: { id: { in: mediaIds } },
    select: { id: true, owner_id: true },
  });
  const allOwned = medias.length === mediaIds.length && medias.every((m) => m.owner_id === userId);
  if (!allOwned) {
    const err: AppError = new Error();
    err.statusCode = 403;
    err.messageKey = 'media.not_owned';
    next(err);
    return false;
  }
  return true;
}

// ─── Select / map ─────────────────────────────────────────────────────────────

const serviceSelect = {
  id: true,
  title: true,
  description: true,
  owner_id: true,
  branch_id: true,
  service_category_id: true,
  service_category: { select: { id: true, key: true } },
  price: true,
  price_type: true,
  duration: true,
  address: true,
  status: true,
  rejection_reason: true,
  created_at: true,
  updated_at: true,
  images: {
    select: {
      id: true,
      media_id: true,
      order: true,
      media: { select: { id: true, storage_path: true } },
    },
    orderBy: { order: 'asc' as const },
  },
} as const;

function mapService(raw: any) {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? undefined,
    owner_id: raw.owner_id,
    branch_id: raw.branch_id ?? null,
    service_category_id: raw.service_category_id ?? null,
    service_category: raw.service_category ?? null,
    price: raw.price ? Number(raw.price) : null,
    price_type: raw.price_type,
    duration: raw.duration ?? null,
    address: raw.address ?? undefined,
    status: raw.status,
    rejection_reason: raw.rejection_reason ?? undefined,
    images: raw.images.map((img: any) => ({
      id: img.id,
      media_id: img.media_id,
      order: img.order,
      url: buildFileUrl(img.media.storage_path),
    })),
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

const SIGNIFICANT_FIELDS = ['title', 'description', 'price', 'price_type', 'duration', 'address', 'branch_id', 'service_category_id'] as const;

// ─── Media upload ─────────────────────────────────────────────────────────────

export const uploadServiceMedia = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

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
        kind: 'service_image',
        storage_path: storagePath,
        checksum: validated.checksum,
        width: validated.width,
        height: validated.height,
        is_public: true,
        owner_id: userId,
      },
    });

    sendSuccess({
      res,
      status: 201,
      message: 'media.service_upload_success',
      data: { media_id: media.id, url: buildFileUrl(storagePath) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Create ───────────────────────────────────────────────────────────────────

export const createService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const userId = req.user.sub;
    const body = req.body as CreateServiceInput;

    // Validate branch membership if branch_id provided
    if (body.branch_id) {
      const membership = await prisma.teamMember.findFirst({
        where: { team: { branch_id: body.branch_id }, user_id: userId, status: 'ACCEPTED' },
      });
      if (!membership) {
        const err: AppError = new Error();
        err.statusCode = 403;
        err.messageKey = 'service.not_branch_member';
        return next(err);
      }
    }

    // Validate image media ownership
    const imageIds = body.image_media_ids ?? [];
    if (!(await validateMediaOwnership(imageIds, userId, next))) return;

    const service = await prisma.service.create({
      data: {
        title: body.title,
        description: body.description,
        owner_id: userId,
        branch_id: body.branch_id ?? null,
        service_category_id: body.service_category_id ?? null,
        price: body.price !== undefined ? body.price : null,
        price_type: body.price_type ?? 'FIXED',
        duration: body.duration ?? null,
        address: body.address,
        status: 'DRAFT',
        images:
          imageIds.length > 0
            ? {
                create: imageIds.map((mediaId, index) => ({
                  media_id: mediaId,
                  order: index,
                })),
              }
            : undefined,
      },
      select: serviceSelect,
    });

    sendSuccess({ res, status: 201, message: 'service.created', data: { service: mapService(service) } });
  } catch (err) {
    next(err);
  }
};

// ─── My services ──────────────────────────────────────────────────────────────

export const getMyServices = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const userId = req.user.sub;

    const services = await prisma.service.findMany({
      where: { owner_id: userId },
      select: serviceSelect,
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({ res, status: 200, message: 'service.list', data: { services: services.map(mapService) } });
  } catch (err) {
    next(err);
  }
};

// ─── Public listing ───────────────────────────────────────────────────────────

export const listPublicServices = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const service_category_id = typeof req.query['service_category_id'] === 'string' ? req.query['service_category_id'] : undefined;
    const branch_id = typeof req.query['branch_id'] === 'string' ? req.query['branch_id'] : undefined;
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;

    const services = await prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        ...(service_category_id && { service_category_id }),
        ...(branch_id && { branch_id }),
        ...(q && {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      select: serviceSelect,
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({ res, status: 200, message: 'service.list', data: { services: services.map(mapService) } });
  } catch (err) {
    next(err);
  }
};

// ─── Get by ID ────────────────────────────────────────────────────────────────

export const getServiceById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = req.params['id'] as string;

    const service = await prisma.service.findUnique({ where: { id }, select: serviceSelect });

    if (!service) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    // Non-ACTIVE services are only visible to their owner
    if (service.status !== 'ACTIVE') {
      const userId = req.user?.sub;
      if (!userId || service.owner_id !== userId) {
        const err: AppError = new Error();
        err.statusCode = 404;
        err.messageKey = 'service.not_found';
        return next(err);
      }
    }

    sendSuccess({ res, status: 200, message: 'service.found', data: { service: mapService(service) } });
  } catch (err) {
    next(err);
  }
};

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;
    const body = req.body as UpdateServiceInput;

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { owner_id: true, status: true },
    });

    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if (!requireOwner(existing.owner_id, userId, next)) return;

    const { status } = existing;

    // ARCHIVED and PENDING cannot be edited
    if (status === 'ARCHIVED' || status === 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_update_in_current_status';
      return next(err);
    }

    // Determine if re-moderation is needed (ACTIVE service with significant changes)
    const hasSignificantFieldChange = SIGNIFICANT_FIELDS.some(
      (field) => body[field] !== undefined,
    );
    const hasImageChange = body.image_media_ids !== undefined;
    const needsRemoderation = status === 'ACTIVE' && (hasSignificantFieldChange || hasImageChange);

    // Validate image ownership if images are being replaced
    const imageIds = body.image_media_ids;
    if (imageIds !== undefined) {
      if (!(await validateMediaOwnership(imageIds, userId, next))) return;
      // Replace all existing images
      await prisma.serviceMedia.deleteMany({ where: { service_id: id } });
    }

    const service = await prisma.service.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.branch_id !== undefined && { branch_id: body.branch_id }),
        ...(body.service_category_id !== undefined && { service_category_id: body.service_category_id }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.price_type !== undefined && { price_type: body.price_type }),
        ...(body.duration !== undefined && { duration: body.duration }),
        ...(body.address !== undefined && { address: body.address }),
        ...(needsRemoderation && { status: 'PENDING', rejection_reason: null }),
        ...(imageIds !== undefined &&
          imageIds.length > 0 && {
            images: {
              create: imageIds.map((mediaId, index) => ({ media_id: mediaId, order: index })),
            },
          }),
      },
      select: serviceSelect,
    });

    sendSuccess({ res, status: 200, message: 'service.updated', data: { service: mapService(service) } });
  } catch (err) {
    next(err);
  }
};

// ─── Delete ───────────────────────────────────────────────────────────────────

export const deleteService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { owner_id: true, status: true },
    });

    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if (!requireOwner(existing.owner_id, userId, next)) return;

    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_delete_in_current_status';
      return next(err);
    }

    await prisma.service.delete({ where: { id } });

    sendSuccess({ res, status: 200, message: 'service.deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── Lifecycle transitions ────────────────────────────────────────────────────

export const submitService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { owner_id: true, status: true },
    });

    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if (!requireOwner(existing.owner_id, userId, next)) return;

    if (
      existing.status !== 'DRAFT' &&
      existing.status !== 'REJECTED' &&
      existing.status !== 'PAUSED'
    ) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_submit_in_current_status';
      return next(err);
    }

    const service = await prisma.service.update({
      where: { id },
      data: { status: 'PENDING', rejection_reason: null },
      select: serviceSelect,
    });

    sendSuccess({ res, status: 200, message: 'service.submitted', data: { service: mapService(service) } });
  } catch (err) {
    next(err);
  }
};

export const pauseService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { owner_id: true, status: true },
    });

    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if (!requireOwner(existing.owner_id, userId, next)) return;

    if (existing.status !== 'ACTIVE') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_pause_in_current_status';
      return next(err);
    }

    const service = await prisma.service.update({
      where: { id },
      data: { status: 'PAUSED' },
      select: serviceSelect,
    });

    sendSuccess({ res, status: 200, message: 'service.paused', data: { service: mapService(service) } });
  } catch (err) {
    next(err);
  }
};

export const resumeService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { owner_id: true, status: true },
    });

    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if (!requireOwner(existing.owner_id, userId, next)) return;

    if (existing.status !== 'PAUSED') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_resume_in_current_status';
      return next(err);
    }

    const service = await prisma.service.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: serviceSelect,
    });

    sendSuccess({ res, status: 200, message: 'service.resumed', data: { service: mapService(service) } });
  } catch (err) {
    next(err);
  }
};

export const archiveService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { owner_id: true, status: true },
    });

    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if (!requireOwner(existing.owner_id, userId, next)) return;

    if (existing.status !== 'ACTIVE' && existing.status !== 'PAUSED') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_archive_in_current_status';
      return next(err);
    }

    const service = await prisma.service.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      select: serviceSelect,
    });

    sendSuccess({ res, status: 200, message: 'service.archived', data: { service: mapService(service) } });
  } catch (err) {
    next(err);
  }
};

export const unarchiveService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { owner_id: true, status: true },
    });

    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if (!requireOwner(existing.owner_id, userId, next)) return;

    if (existing.status !== 'ARCHIVED') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_unarchive_in_current_status';
      return next(err);
    }

    const service = await prisma.service.update({
      where: { id },
      data: { status: 'DRAFT' },
      select: serviceSelect,
    });

    sendSuccess({ res, status: 200, message: 'service.unarchived', data: { service: mapService(service) } });
  } catch (err) {
    next(err);
  }
};

// ─── Service categories (public) ──────────────────────────────────────────────

export const listServiceCategories = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const categories = await prisma.serviceCategory.findMany({ orderBy: { key: 'asc' } });
    sendSuccess({ res, status: 200, message: 'service.categories_list', data: { categories } });
  } catch (err) {
    next(err);
  }
};

