import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { buildFileUrl } from '../services/storage.service';
import type {
  CreateBrandInput,
  UpdateBrandInput,
  TransferBrandInput,
  DeleteBrandInput,
  CreateBranchInput,
  UpdateBranchInput,
} from '../schemas/brand.schema';

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
    err.messageKey = 'brand.not_owner';
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

const brandSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  owner_id: true,
  logo_media_id: true,
  created_at: true,
  updated_at: true,
  categories: { select: { id: true, name: true } },
  logo_media: { select: { id: true, storage_path: true } },
  gallery: {
    select: {
      id: true,
      media_id: true,
      order: true,
      media: { select: { id: true, storage_path: true } },
    },
    orderBy: { order: 'asc' as const },
  },
} as const;

type BrandRaw = Awaited<ReturnType<typeof prisma.brand.findUniqueOrThrow>> & {
  categories: { id: string; name: string }[];
  logo_media: { id: string; storage_path: string } | null;
  gallery: { id: string; media_id: string; order: number; media: { id: string; storage_path: string } }[];
};

function mapBrand(raw: BrandRaw) {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    status: raw.status,
    owner_id: raw.owner_id,
    logo_url: raw.logo_media ? buildFileUrl(raw.logo_media.storage_path) : undefined,
    categories: raw.categories,
    gallery: raw.gallery.map((g) => ({
      id: g.id,
      media_id: g.media_id,
      order: g.order,
      url: buildFileUrl(g.media.storage_path),
    })),
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

const branchSelect = {
  id: true,
  brand_id: true,
  name: true,
  description: true,
  address1: true,
  address2: true,
  phone: true,
  email: true,
  is_24_7: true,
  opening: true,
  closing: true,
  created_at: true,
  updated_at: true,
  breaks: { select: { id: true, start: true, end: true } },
} as const;

// ─── Brand CRUD ───────────────────────────────────────────────────────────────

export const createBrand = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email_verified: true, phone_verified: true },
    });

    if (!user || (!user.email_verified && !user.phone_verified)) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'brand.verification_required';
      return next(err);
    }

    const body = req.body as CreateBrandInput;

    // Validate media ownership
    const allMediaIds = [
      ...(body.logo_media_id ? [body.logo_media_id] : []),
      ...(body.gallery_media_ids ?? []),
    ];
    if (!(await validateMediaOwnership(allMediaIds, userId, next))) return;

    const brand = await prisma.brand.create({
      data: {
        name: body.name,
        description: body.description,
        owner_id: userId,
        logo_media_id: body.logo_media_id ?? null,
        categories:
          body.categoryIds && body.categoryIds.length > 0
            ? { connect: body.categoryIds.map((id) => ({ id })) }
            : undefined,
        gallery:
          body.gallery_media_ids && body.gallery_media_ids.length > 0
            ? {
                create: body.gallery_media_ids.map((mediaId, index) => ({
                  media_id: mediaId,
                  order: index,
                })),
              }
            : undefined,
      },
      select: brandSelect,
    });

    sendSuccess({ res, status: 201, message: 'brand.created', data: { brand: mapBrand(brand as BrandRaw) } });
  } catch (err) {
    next(err);
  }
};

export const getMyBrands = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const userId = req.user.sub;

    const brands = await prisma.brand.findMany({
      where: { owner_id: userId },
      select: brandSelect,
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({ res, status: 200, message: 'brand.list', data: { brands: brands.map((b) => mapBrand(b as BrandRaw)) } });
  } catch (err) {
    next(err);
  }
};

export const getBrandById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = req.params['id'] as string;

    const brand = await prisma.brand.findUnique({
      where: { id },
      select: { ...brandSelect, branches: { select: branchSelect } },
    });

    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    // Non-ACTIVE brands are only visible to their owner
    if (brand.status !== 'ACTIVE') {
      const userId = req.user?.sub;
      if (!userId || brand.owner_id !== userId) {
        const err: AppError = new Error();
        err.statusCode = 404;
        err.messageKey = 'brand.not_found';
        return next(err);
      }
    }

    sendSuccess({ res, status: 200, message: 'brand.found', data: { brand: { ...mapBrand(brand as BrandRaw), branches: brand.branches } } });
  } catch (err) {
    next(err);
  }
};

export const updateBrand = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.brand.findUnique({ where: { id }, select: { owner_id: true } });
    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }
    if (!requireOwner(existing.owner_id, userId, next)) return;

    const body = req.body as UpdateBrandInput;

    // Validate ownership of any new media being attached
    const newMediaIds = [
      ...(body.logo_media_id && body.logo_media_id !== null ? [body.logo_media_id] : []),
      ...(body.gallery_media_ids ?? []),
    ];
    if (!(await validateMediaOwnership(newMediaIds, userId, next))) return;

    // Gallery: if provided, delete all existing entries and recreate the full list.
    // The frontend must include existing media_ids it wants to keep alongside new ones.
    if (body.gallery_media_ids !== undefined) {
      await prisma.brandGallery.deleteMany({ where: { brand_id: id } });
    }

    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        // logo_media_id can be set to null (removal) or a new id; skip if not in payload
        ...(body.logo_media_id !== undefined && { logo_media_id: body.logo_media_id }),
        ...(body.categoryIds !== undefined && {
          categories: {
            set: body.categoryIds.map((cid) => ({ id: cid })),
          },
        }),
        ...(body.gallery_media_ids !== undefined &&
          body.gallery_media_ids.length > 0 && {
            gallery: {
              create: body.gallery_media_ids.map((mediaId, index) => ({
                media_id: mediaId,
                order: index,
              })),
            },
          }),
      },
      select: brandSelect,
    });

    sendSuccess({ res, status: 200, message: 'brand.updated', data: { brand: mapBrand(brand as BrandRaw) } });
  } catch (err) {
    next(err);
  }
};

export const deleteBrand = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.brand.findUnique({ where: { id }, select: { owner_id: true } });
    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }
    if (!requireOwner(existing.owner_id, userId, next)) return;

    const body = req.body as Partial<DeleteBrandInput>;
    const serviceHandling = body.service_handling ?? 'delete';

    // TODO(services): When the services module is implemented, handle the service_handling
    // choice here before deleting the brand:
    //   - 'delete': delete all services belonging to this brand
    //   - 'transfer_to_self': re-assign brand services to the owner's self-brand account
    //   - 'transfer_to_other': initiate service transfer to body.service_target_user_id
    // For now we proceed with a safe brand-only delete since services don't exist yet.
    void serviceHandling; // explicitly unused until services module is built

    await prisma.brand.delete({ where: { id } });

    sendSuccess({ res, status: 200, message: 'brand.deleted' });
  } catch (err) {
    next(err);
  }
};

export const listPublicBrands = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const brands = await prisma.brand.findMany({
      where: { status: 'ACTIVE' },
      select: brandSelect,
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({ res, status: 200, message: 'brand.list', data: { brands: brands.map((b) => mapBrand(b as BrandRaw)) } });
  } catch (err) {
    next(err);
  }
};

// ─── Transfer ─────────────────────────────────────────────────────────────────

export const transferBrand = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;

    const existing = await prisma.brand.findUnique({
      where: { id },
      select: { owner_id: true, name: true },
    });
    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }
    if (!requireOwner(existing.owner_id, userId, next)) return;

    const body = req.body as TransferBrandInput;

    if (body.target_user_id === userId) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'brand.transfer_self';
      return next(err);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: body.target_user_id },
      select: { id: true, type: true, first_name: true, last_name: true },
    });

    if (!targetUser) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'user.not_found';
      return next(err);
    }

    if (targetUser.type !== 'uso') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'brand.transfer_target_not_uso';
      return next(err);
    }

    // Cancel any existing pending transfer for this brand
    await prisma.brandTransfer.updateMany({
      where: { brand_id: id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    const transfer = await prisma.brandTransfer.create({
      data: {
        brand_id: id,
        from_user_id: userId,
        to_user_id: body.target_user_id,
        status: 'PENDING',
      },
    });

    // Notify the recipient
    await prisma.notification.create({
      data: {
        user_id: body.target_user_id,
        type: 'brand_transfer_request',
        title: 'Brand transfer request',
        body: `A user wants to transfer the brand "${existing.name}" to you.`,
        data: { transfer_id: transfer.id, brand_id: id },
      },
    });

    sendSuccess({ res, status: 201, message: 'brand.transfer_initiated', data: { transfer } });
  } catch (err) {
    next(err);
  }
};

export const acceptTransfer = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const transferId = req.params['transferId'] as string;
    const userId = req.user.sub;

    const transfer = await prisma.brandTransfer.findUnique({
      where: { id: transferId },
      select: { id: true, brand_id: true, from_user_id: true, to_user_id: true, status: true, brand: { select: { name: true } } },
    });

    if (!transfer || transfer.to_user_id !== userId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.transfer_not_found';
      return next(err);
    }

    if (transfer.status !== 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'brand.transfer_not_pending';
      return next(err);
    }

    // Update owner and mark transfer accepted atomically
    await prisma.$transaction([
      prisma.brand.update({
        where: { id: transfer.brand_id },
        data: { owner_id: userId },
      }),
      prisma.brandTransfer.update({
        where: { id: transferId },
        data: { status: 'ACCEPTED' },
      }),
    ]);

    // Notify the sender
    await prisma.notification.create({
      data: {
        user_id: transfer.from_user_id,
        type: 'brand_transfer_accepted',
        title: 'Transfer accepted',
        body: `Your transfer request for brand "${transfer.brand.name}" was accepted.`,
        data: { transfer_id: transferId, brand_id: transfer.brand_id },
      },
    });

    sendSuccess({ res, status: 200, message: 'brand.transfer_accepted' });
  } catch (err) {
    next(err);
  }
};

export const rejectTransfer = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const transferId = req.params['transferId'] as string;
    const userId = req.user.sub;

    const transfer = await prisma.brandTransfer.findUnique({
      where: { id: transferId },
      select: { id: true, brand_id: true, from_user_id: true, to_user_id: true, status: true, brand: { select: { name: true } } },
    });

    if (!transfer || transfer.to_user_id !== userId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.transfer_not_found';
      return next(err);
    }

    if (transfer.status !== 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'brand.transfer_not_pending';
      return next(err);
    }

    await prisma.brandTransfer.update({
      where: { id: transferId },
      data: { status: 'REJECTED' },
    });

    // Notify the sender
    await prisma.notification.create({
      data: {
        user_id: transfer.from_user_id,
        type: 'brand_transfer_rejected',
        title: 'Transfer rejected',
        body: `Your transfer request for brand "${transfer.brand.name}" was rejected.`,
        data: { transfer_id: transferId, brand_id: transfer.brand_id },
      },
    });

    sendSuccess({ res, status: 200, message: 'brand.transfer_rejected' });
  } catch (err) {
    next(err);
  }
};

export const cancelTransfer = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const transferId = req.params['transferId'] as string;
    const userId = req.user.sub;

    const transfer = await prisma.brandTransfer.findUnique({
      where: { id: transferId },
      select: { id: true, from_user_id: true, status: true },
    });

    if (!transfer || transfer.from_user_id !== userId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.transfer_not_found';
      return next(err);
    }

    if (transfer.status !== 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'brand.transfer_not_pending';
      return next(err);
    }

    await prisma.brandTransfer.update({
      where: { id: transferId },
      data: { status: 'CANCELLED' },
    });

    sendSuccess({ res, status: 200, message: 'brand.transfer_cancelled' });
  } catch (err) {
    next(err);
  }
};

export const listIncomingTransfers = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;

    const transfers = await prisma.brandTransfer.findMany({
      where: { to_user_id: userId, status: 'PENDING' },
      include: {
        brand: { select: { id: true, name: true, logo_media: { select: { storage_path: true } } } },
        from_user: { select: { id: true, first_name: true, last_name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({ res, status: 200, message: 'brand.transfer_list', data: { transfers } });
  } catch (err) {
    next(err);
  }
};

// ─── Branches ─────────────────────────────────────────────────────────────────

export const addBranch = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const brandId = req.params['id'] as string;
    const userId = req.user.sub;

    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { owner_id: true } });
    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }
    if (!requireOwner(brand.owner_id, userId, next)) return;

    const body = req.body as CreateBranchInput;

    const branch = await prisma.branch.create({
      data: {
        brand_id: brandId,
        name: body.name,
        description: body.description,
        address1: body.address1,
        address2: body.address2,
        phone: body.phone,
        email: body.email,
        is_24_7: body.is_24_7 ?? false,
        opening: body.is_24_7 ? null : (body.opening ?? null),
        closing: body.is_24_7 ? null : (body.closing ?? null),
        breaks:
          body.breaks && body.breaks.length > 0
            ? { create: body.breaks.map((b) => ({ start: b.start, end: b.end })) }
            : undefined,
      },
      select: branchSelect,
    });

    sendSuccess({ res, status: 201, message: 'branch.created', data: { branch } });
  } catch (err) {
    next(err);
  }
};

export const updateBranch = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const brandId = req.params['id'] as string;
    const branchId = req.params['branchId'] as string;
    const userId = req.user.sub;

    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { owner_id: true } });
    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }
    if (!requireOwner(brand.owner_id, userId, next)) return;

    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, brand_id: true },
    });

    if (!existingBranch || existingBranch.brand_id !== brandId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'branch.not_found';
      return next(err);
    }

    const body = req.body as UpdateBranchInput;

    // If breaks are provided, replace them entirely
    if (body.breaks !== undefined) {
      await prisma.branchBreak.deleteMany({ where: { branch_id: branchId } });
    }

    const branch = await prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.address1 !== undefined && { address1: body.address1 }),
        ...(body.address2 !== undefined && { address2: body.address2 }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.is_24_7 !== undefined && { is_24_7: body.is_24_7 }),
        ...(body.opening !== undefined && { opening: body.opening }),
        ...(body.closing !== undefined && { closing: body.closing }),
        // Clear opening/closing when switching to 24/7
        ...(body.is_24_7 === true && { opening: null, closing: null }),
        ...(body.breaks !== undefined &&
          body.breaks.length > 0 && {
            breaks: {
              create: body.breaks.map((b) => ({ start: b.start, end: b.end })),
            },
          }),
      },
      select: branchSelect,
    });

    sendSuccess({ res, status: 200, message: 'branch.updated', data: { branch } });
  } catch (err) {
    next(err);
  }
};

export const deleteBranch = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const brandId = req.params['id'] as string;
    const branchId = req.params['branchId'] as string;
    const userId = req.user.sub;

    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { owner_id: true } });
    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }
    if (!requireOwner(brand.owner_id, userId, next)) return;

    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, brand_id: true },
    });

    if (!existingBranch || existingBranch.brand_id !== brandId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'branch.not_found';
      return next(err);
    }

    await prisma.branch.delete({ where: { id: branchId } });

    sendSuccess({ res, status: 200, message: 'branch.deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── Categories ───────────────────────────────────────────────────────────────

export const listCategories = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const categories = await prisma.brandCategory.findMany({
      orderBy: { name: 'asc' },
    });

    sendSuccess({ res, status: 200, message: 'brand.categories_list', data: { categories } });
  } catch (err) {
    next(err);
  }
};
