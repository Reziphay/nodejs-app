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

function requireUcr(req: Request, next: NextFunction): boolean {
  if (req.user.type !== 'ucr') {
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
  brand_id: true,
  service_category_id: true,
  service_category: { select: { id: true, key: true } },
  brand: {
    select: {
      id: true,
      name: true,
      owner_id: true,
      status: true,
      logo_media: { select: { id: true, storage_path: true } },
      ratings: {
        select: {
          value: true,
          user_id: true,
        },
      },
    },
  },
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
  ratings: {
    select: {
      value: true,
      user_id: true,
    },
  },
} as const;

function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

function mapService(raw: any, requesterId?: string) {
  const ratingCount = raw.ratings?.length ?? 0;
  const ratingAverage =
    ratingCount > 0
      ? roundRating(raw.ratings.reduce((sum: number, rating: { value: number }) => sum + rating.value, 0) / ratingCount)
      : null;
  const myRating =
    requesterId
      ? raw.ratings?.find((rating: { user_id: string }) => rating.user_id === requesterId)?.value ?? null
      : null;
  // Public rating aggregates are suppressed until reservation-based eligibility
  // gating is implemented. Only the service owner sees the raw aggregate so they
  // can monitor incoming feedback. Other viewers see null/0.
  const isOwner = !!requesterId && raw.owner_id === requesterId;
  const publicRating = isOwner ? ratingAverage : null;
  const publicRatingCount = isOwner ? ratingCount : 0;
  const brandRatingCount = raw.brand?.ratings?.length ?? 0;
  const brandRating =
    brandRatingCount > 0
      ? roundRating(raw.brand.ratings.reduce((sum: number, rating: { value: number }) => sum + rating.value, 0) / brandRatingCount)
      : null;

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? undefined,
    owner_id: raw.owner_id,
    brand_id: raw.brand_id ?? null,
    brand: raw.brand
      ? {
          id: raw.brand.id,
          name: raw.brand.name,
          owner_id: raw.brand.owner_id,
          logo_url: raw.brand.logo_media ? buildFileUrl(raw.brand.logo_media.storage_path) : undefined,
          rating: brandRating,
          rating_count: brandRatingCount,
        }
      : null,
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
    rating: publicRating,
    rating_count: publicRatingCount,
    my_rating: myRating,
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

const SIGNIFICANT_FIELDS = ['title', 'description', 'price', 'price_type', 'duration', 'address', 'brand_id', 'service_category_id'] as const;

// Verify user can attach a service to the given brand. Brand-owned services are
// created by the owner; team members can later request assignment to them.
async function validateBrandOwnership(
  brandId: string,
  userId: string,
  next: NextFunction,
): Promise<boolean> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { owner_id: true },
  });
  if (!brand) {
    const err: AppError = new Error();
    err.statusCode = 404;
    err.messageKey = 'brand.not_found';
    next(err);
    return false;
  }
  if (brand.owner_id !== userId) {
    const err: AppError = new Error();
    err.statusCode = 403;
    err.messageKey = 'brand.not_owner';
    next(err);
    return false;
  }
  return true;
}

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

    // Validate brand ownership if brand_id provided
    if (body.brand_id) {
      if (!(await validateBrandOwnership(body.brand_id, userId, next))) return;
    }

    // Validate image media ownership
    const imageIds = body.image_media_ids ?? [];
    if (!(await validateMediaOwnership(imageIds, userId, next))) return;

    const service = await prisma.service.create({
      data: {
        title: body.title,
        description: body.description,
        owner_id: userId,
        brand_id: body.brand_id ?? null,
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

    sendSuccess({ res, status: 201, message: 'service.created', data: { service: mapService(service, userId) } });
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

    sendSuccess({ res, status: 200, message: 'service.list', data: { services: services.map((service) => mapService(service, userId)) } });
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
    const brand_id = typeof req.query['brand_id'] === 'string' ? req.query['brand_id'] : undefined;
    const owner_id = typeof req.query['owner_id'] === 'string' ? req.query['owner_id'] : undefined;
    const direct_only = req.query['direct_only'] === 'true';
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;
    const page = Math.max(1, Number.parseInt(String(req.query['page'] ?? '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query['limit'] ?? '60'), 10) || 60));
    const skip = (page - 1) * limit;
    const where = {
      status: 'ACTIVE' as const,
      ...(service_category_id && { service_category_id }),
      ...(brand_id && !direct_only && { brand_id }),
      ...(owner_id && { owner_id }),
      ...(direct_only && { brand_id: null }),
      ...(branch_id && {
        member_assignments: {
          some: {
            status: 'ACCEPTED' as const,
            team_member: { status: 'ACCEPTED' as const, team: { branch_id } },
          },
        },
      }),
      // Brand-linked services are only public if their parent brand is ACTIVE.
      // Direct services (brand_id IS NULL) are unaffected.
      AND: [
        {
          OR: [
            { brand_id: null },
            { brand: { status: 'ACTIVE' as const } },
          ],
        },
      ],
      ...(q && {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { description: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [services, totalCount] = await Promise.all([
      prisma.service.findMany({
        where,
        select: serviceSelect,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.service.count({ where }),
    ]);

    sendSuccess({
      res,
      status: 200,
      message: 'service.list',
      data: {
        services: services.map((service) => mapService(service)),
        meta: {
          page,
          limit,
          total_count: totalCount,
          has_more: skip + services.length < totalCount,
        },
      },
    });
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

    const userId = req.user?.sub;
    const isOwner = !!userId && service.owner_id === userId;

    // Non-ACTIVE services are only visible to their owner
    if (service.status !== 'ACTIVE' && !isOwner) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    // Brand-linked services with a non-ACTIVE parent brand are hidden from non-owners.
    if (service.brand && service.brand.status !== 'ACTIVE' && !isOwner) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'service.found', data: { service: mapService(service, req.user?.sub) } });
  } catch (err) {
    next(err);
  }
};

// ─── Rating ──────────────────────────────────────────────────────────────────

export const upsertServiceRating = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUcr(req, next)) return;

    const err: AppError = new Error();
    err.statusCode = 501;
    err.messageKey = 'service.rating_not_available';
    return next(err);
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
      select: { owner_id: true, status: true, brand_id: true, address: true },
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

    // If brand_id is being changed, validate ownership on the new brand
    if (body.brand_id !== undefined && body.brand_id !== null) {
      if (!(await validateBrandOwnership(body.brand_id, userId, next))) return;
    }

    const nextBrandId = body.brand_id !== undefined ? body.brand_id : existing.brand_id;
    const nextAddress = body.address !== undefined ? body.address : existing.address;
    if (!nextBrandId && !nextAddress?.trim()) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.branch_or_address_required';
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
        ...(body.brand_id !== undefined && { brand_id: body.brand_id }),
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
