import { Request, Response, NextFunction } from 'express';
import { Prisma } from '../generated/prisma/client';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { buildFileUrl } from '../services/storage.service';
import type {
  CreateBrandInput,
  UpdateBrandInput,
  TransferBrandInput,
  UpsertBrandRatingInput,
  DeleteBrandInput,
  CreateBranchInput,
  UpdateBranchInput,
} from '../schemas/brand.schema';
import { getStepUpPurpose, requireStepUp } from '../services/auth/auth.service';
import { buildBrandResubmissionPatch } from '../services/brand-moderation.service';
import { hasCompletedReservationEligibility } from '../services/brand-rating-eligibility.service';
import {
  buildBrandSlotSnapshot,
  type BrandSlotEntitlementLike,
} from '../services/brand-slot.service';

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
    err.messageKey = 'brand.not_owner';
    next(err);
    return false;
  }
  return true;
}

function getViewerRole(
  user: Request['user'] | undefined,
  ownerId: string,
): 'public' | 'owner' | 'admin' {
  if (!user?.sub) {
    return 'public';
  }

  if (user.sub === ownerId) {
    return 'owner';
  }

  if (user.type === 'admin') {
    return 'admin';
  }

  return 'public';
}

function createError(statusCode: number, messageKey: string, details?: unknown): AppError {
  const err: AppError = new Error();
  err.statusCode = statusCode;
  err.messageKey = messageKey;
  err.details = details;
  return err;
}

function mapSocialLinks(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(([, entryValue]) => typeof entryValue === 'string');
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

async function getBrandSlotSnapshotForUser(userId: string) {
  const [ownedBrandCount, entitlements] = await Promise.all([
    prisma.brand.count({ where: { owner_id: userId } }),
    prisma.brandSlotEntitlement.findMany({
      where: { user_id: userId },
      select: {
        additional_slots: true,
        status: true,
        starts_at: true,
        ends_at: true,
      },
    }),
  ]);

  return buildBrandSlotSnapshot(
    ownedBrandCount,
    entitlements as BrandSlotEntitlementLike[],
  );
}

async function ensureBrandSlotAvailable(userId: string): Promise<void> {
  const slotSnapshot = await getBrandSlotSnapshotForUser(userId);
  if (!slotSnapshot.has_available_slot) {
    throw createError(403, 'brand.slot_limit_reached', { slot_usage: slotSnapshot });
  }
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

async function validateBrandMediaAspectRatios(
  {
    logoMediaId,
    galleryMediaIds,
  }: {
    logoMediaId?: string | null;
    galleryMediaIds?: string[];
  },
  next: NextFunction,
): Promise<boolean> {
  const ids = [
    ...(logoMediaId ? [logoMediaId] : []),
    ...(galleryMediaIds ?? []),
  ];

  if (ids.length === 0) return true;

  const medias = await prisma.media.findMany({
    where: { id: { in: ids } },
    select: { id: true, width: true, height: true },
  });

  const mediaMap = new Map(medias.map((media) => [media.id, media]));

  const hasExpectedRatio = (width: number | null, height: number | null, expected: number) => {
    if (!width || !height) return false;
    return Math.abs(width / height - expected) <= 0.02;
  };

  if (logoMediaId) {
    const logoMedia = mediaMap.get(logoMediaId);
    if (!logoMedia || !hasExpectedRatio(logoMedia.width, logoMedia.height, 1)) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'media.invalid_logo_ratio';
      next(err);
      return false;
    }
  }

  for (const mediaId of galleryMediaIds ?? []) {
    const galleryMedia = mediaMap.get(mediaId);
    if (!galleryMedia || !hasExpectedRatio(galleryMedia.width, galleryMedia.height, 16 / 9)) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'media.invalid_gallery_ratio';
      next(err);
      return false;
    }
  }

  return true;
}

function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

const brandSelect = {
  id: true,
  name: true,
  description: true,
  website_url: true,
  social_links: true,
  status: true,
  owner_id: true,
  logo_media_id: true,
  submitted_for_review_at: true,
  moderation_reviewed_at: true,
  moderation_reviewed_by_user_id: true,
  moderation_rejection_reason: true,
  created_at: true,
  updated_at: true,
  categories: { select: { id: true, name: true } },
  logo_media: { select: { id: true, storage_path: true } },
  moderation_reviewer: {
    select: {
      id: true,
      first_name: true,
      last_name: true,
    },
  },
  gallery: {
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

type BrandRaw = Awaited<ReturnType<typeof prisma.brand.findUniqueOrThrow>> & {
  categories: { id: string; name: string }[];
  logo_media: { id: string; storage_path: string } | null;
  social_links: unknown;
  moderation_reviewer: { id: string; first_name: string; last_name: string } | null;
  gallery: { id: string; media_id: string; order: number; media: { id: string; storage_path: string } }[];
  ratings: { value: number; user_id: string }[];
};

function mapBrand(
  raw: BrandRaw,
  options: {
    requesterId?: string;
    viewerRole?: 'public' | 'owner' | 'admin';
    canRate?: boolean;
  } = {},
) {
  const viewerRole = options.viewerRole ?? 'public';
  const ratingCount = raw.ratings.length;
  const ratingAverage =
    ratingCount > 0
      ? roundRating(raw.ratings.reduce((sum, rating) => sum + rating.value, 0) / ratingCount)
      : null;
  const myRating =
    options.requesterId
      ? raw.ratings.find((rating) => rating.user_id === options.requesterId)?.value ?? null
      : null;

  const base = {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    website_url: raw.website_url ?? undefined,
    social_links: mapSocialLinks(raw.social_links),
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
    rating: ratingAverage,
    rating_count: ratingCount,
    my_rating: myRating,
    ratings: {
      average: ratingAverage,
      count: ratingCount,
      my_rating: myRating,
      can_rate: options.canRate ?? false,
    },
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };

  if (viewerRole === 'public') {
    return base;
  }

  return {
    ...base,
    moderation: {
      status: raw.status,
      submitted_for_review_at: raw.submitted_for_review_at?.toISOString() ?? null,
      reviewed_at: raw.moderation_reviewed_at?.toISOString() ?? null,
      rejection_reason: raw.moderation_rejection_reason ?? null,
      is_resubmittable: raw.status === 'REJECTED',
      reviewer: raw.moderation_reviewer
        ? {
            id: raw.moderation_reviewer.id,
            first_name: raw.moderation_reviewer.first_name,
            last_name: raw.moderation_reviewer.last_name,
          }
        : null,
    },
  };
}

const branchSelect = {
  id: true,
  brand_id: true,
  name: true,
  description: true,
  address1: true,
  address2: true,
  city: true,
  state: true,
  postal_code: true,
  country: true,
  phone: true,
  email: true,
  is_24_7: true,
  opening: true,
  closing: true,
  cover_media_id: true,
  created_at: true,
  updated_at: true,
  breaks: { select: { id: true, start: true, end: true } },
  interior_media: {
    select: {
      id: true,
      media_id: true,
      order: true,
      media: { select: { id: true, storage_path: true } },
    },
    orderBy: { order: 'asc' as const },
  },
  cover_media: { select: { id: true, storage_path: true } },
} as const;

type BranchRaw = {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  address1: string;
  address2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  is_24_7: boolean;
  opening: string | null;
  closing: string | null;
  cover_media_id: string | null;
  created_at: Date;
  updated_at: Date;
  breaks: { id: string; start: string; end: string }[];
  interior_media: {
    id: string;
    media_id: string;
    order: number;
    media: { id: string; storage_path: string };
  }[];
  cover_media: { id: string; storage_path: string } | null;
};

function mapBranch(raw: BranchRaw) {
  return {
    id: raw.id,
    brand_id: raw.brand_id,
    name: raw.name,
    description: raw.description ?? undefined,
    address1: raw.address1,
    address2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postal_code: raw.postal_code ?? undefined,
    country: raw.country ?? undefined,
    address: {
      address1: raw.address1,
      address2: raw.address2 ?? null,
      city: raw.city ?? null,
      state: raw.state ?? null,
      postal_code: raw.postal_code ?? null,
      country: raw.country ?? null,
    },
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
    is_24_7: raw.is_24_7,
    opening: raw.opening ?? undefined,
    closing: raw.closing ?? undefined,
    cover_media_id: raw.cover_media_id ?? null,
    cover_url: raw.cover_media ? buildFileUrl(raw.cover_media.storage_path) : null,
    breaks: raw.breaks,
    interior_gallery: raw.interior_media.map((media) => ({
      id: media.id,
      media_id: media.media_id,
      order: media.order,
      url: buildFileUrl(media.media.storage_path),
    })),
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

async function validateBranchCoverMediaOwnershipAndRatio(
  coverMediaId: string | null | undefined,
  userId: string,
  next: NextFunction,
): Promise<boolean> {
  if (!coverMediaId) return true;

  const media = await prisma.media.findUnique({
    where: { id: coverMediaId },
    select: { owner_id: true, width: true, height: true },
  });

  if (!media || media.owner_id !== userId) {
    const err: AppError = new Error();
    err.statusCode = 403;
    err.messageKey = 'media.not_owned';
    next(err);
    return false;
  }

  const hasValidRatio = (w: number | null, h: number | null) => {
    if (!w || !h) return false;
    return Math.abs(w / h - 16 / 9) <= 0.02;
  };

  if (!hasValidRatio(media.width, media.height)) {
    const err: AppError = new Error();
    err.statusCode = 400;
    err.messageKey = 'media.invalid_cover_ratio';
    next(err);
    return false;
  }

  return true;
}

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
    await ensureBrandSlotAvailable(userId);

    // Validate media ownership — brand logo + gallery + all branch cover images
    const branchCoverIds = body.branches
      .map((b) => b.cover_media_id)
      .filter((id): id is string => typeof id === 'string');
    const branchInteriorIds = body.branches.flatMap((branch) => branch.interior_media_ids ?? []);

    const allMediaIds = [
      ...(body.logo_media_id ? [body.logo_media_id] : []),
      ...(body.gallery_media_ids ?? []),
      ...branchCoverIds,
      ...branchInteriorIds,
    ];
    if (!(await validateMediaOwnership(allMediaIds, userId, next))) return;

    // Validate branch cover aspect ratios
    for (const coverId of branchCoverIds) {
      if (!(await validateBranchCoverMediaOwnershipAndRatio(coverId, userId, next))) return;
    }
    if (
      !(await validateBrandMediaAspectRatios(
        {
          logoMediaId: body.logo_media_id,
          galleryMediaIds: body.gallery_media_ids,
        },
        next,
      ))
    ) {
      return;
    }

    const now = new Date();
    const brand = await prisma.$transaction(async (tx) => {
      const created = await tx.brand.create({
        data: {
          name: body.name,
          description: body.description,
          website_url: body.website_url,
          social_links: body.social_links,
          owner_id: userId,
          logo_media_id: body.logo_media_id ?? null,
          submitted_for_review_at: now,
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
          branches: {
            create: body.branches.map((branch) => ({
              name: branch.name,
              description: branch.description,
              address1: branch.address1,
              address2: branch.address2,
              city: branch.city,
              state: branch.state,
              postal_code: branch.postal_code,
              country: branch.country,
              phone: branch.phone,
              email: branch.email,
              is_24_7: branch.is_24_7 ?? false,
              opening: branch.is_24_7 ? null : (branch.opening ?? null),
              closing: branch.is_24_7 ? null : (branch.closing ?? null),
              cover_media_id: branch.cover_media_id ?? null,
              breaks:
                branch.breaks && branch.breaks.length > 0
                  ? { create: branch.breaks.map((item) => ({ start: item.start, end: item.end })) }
                  : undefined,
              interior_media:
                branch.interior_media_ids && branch.interior_media_ids.length > 0
                  ? {
                      create: branch.interior_media_ids.map((mediaId, index) => ({
                        media_id: mediaId,
                        order: index,
                      })),
                    }
                  : undefined,
            })),
          },
        },
        select: { id: true },
      });

      // Auto-create a Team + OWNER membership for each branch created above
      const newBranches = await tx.branch.findMany({
        where: { brand_id: created.id },
        select: { id: true },
      });

      for (const branch of newBranches) {
        await tx.team.create({
          data: {
            branch_id: branch.id,
            created_by_user_id: userId,
            members: {
              create: {
                user_id: userId,
                invited_by_user_id: userId,
                role: 'OWNER',
                status: 'ACCEPTED',
              },
            },
          },
        });
      }

      return tx.brand.findUniqueOrThrow({ where: { id: created.id }, select: brandSelect });
    });

    const slotUsage = await getBrandSlotSnapshotForUser(userId);

    sendSuccess({
      res,
      status: 201,
      message: 'brand.created',
      data: {
        brand: mapBrand(brand as BrandRaw, { requesterId: userId, viewerRole: 'owner' }),
        slot_usage: slotUsage,
      },
    });
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

    const [brands, slotUsage] = await Promise.all([
      prisma.brand.findMany({
        where: { owner_id: userId },
        select: brandSelect,
        orderBy: { created_at: 'desc' },
      }),
      getBrandSlotSnapshotForUser(userId),
    ]);

    sendSuccess({
      res,
      status: 200,
      message: 'brand.list',
      data: {
        brands: brands.map((brand) => mapBrand(brand as BrandRaw, { requesterId: userId, viewerRole: 'owner' })),
        slot_usage: slotUsage,
      },
    });
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
      select: {
        ...brandSelect,
        branches: {
          select: branchSelect,
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!brand) {
      return next(createError(404, 'brand.not_found'));
    }

    const viewerRole = getViewerRole(req.user, brand.owner_id);
    const isPubliclyVisible = brand.status === 'ACTIVE' || brand.status === 'CLOSED';
    if (!isPubliclyVisible && viewerRole === 'public') {
      return next(createError(404, 'brand.not_found'));
    }

    const canRate =
      req.user?.type === 'ucr' && brand.status === 'ACTIVE'
        ? hasCompletedReservationEligibility(
            await prisma.brandRatingEligibility.findFirst({
              where: { brand_id: id, user_id: req.user.sub },
              select: { completed_at: true },
              orderBy: { completed_at: 'desc' },
            }),
          )
        : false;

    sendSuccess({
      res,
      status: 200,
      message: 'brand.found',
      data: {
        brand: {
          ...mapBrand(brand as BrandRaw, {
            requesterId: req.user?.sub,
            viewerRole,
            canRate,
          }),
          branches: brand.branches.map((b) => mapBranch(b as BranchRaw)),
        },
        ...(viewerRole === 'owner' ? { slot_usage: await getBrandSlotSnapshotForUser(brand.owner_id) } : {}),
      },
    });
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

    const existing = await prisma.brand.findUnique({
      where: { id },
      select: { owner_id: true, status: true },
    });
    if (!existing) {
      return next(createError(404, 'brand.not_found'));
    }
    if (!requireOwner(existing.owner_id, userId, next)) return;

    const body = req.body as UpdateBrandInput;

    // Validate ownership of any new media being attached
    const newMediaIds = [
      ...(body.logo_media_id && body.logo_media_id !== null ? [body.logo_media_id] : []),
      ...(body.gallery_media_ids ?? []),
    ];
    if (!(await validateMediaOwnership(newMediaIds, userId, next))) return;
    if (
      !(await validateBrandMediaAspectRatios(
        {
          logoMediaId: body.logo_media_id,
          galleryMediaIds: body.gallery_media_ids,
        },
        next,
      ))
    ) {
      return;
    }

    const now = new Date();
    const brand = await prisma.$transaction(async (tx) => {
      if (body.gallery_media_ids !== undefined) {
        await tx.brandGallery.deleteMany({ where: { brand_id: id } });
      }

      return tx.brand.update({
        where: { id },
        data: {
          ...buildBrandResubmissionPatch(existing.status, now),
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.website_url !== undefined && { website_url: body.website_url }),
          ...(body.social_links !== undefined && {
            social_links: body.social_links === null ? Prisma.JsonNull : body.social_links,
          }),
          ...(body.logo_media_id !== undefined && {
            logo_media: body.logo_media_id
              ? { connect: { id: body.logo_media_id } }
              : { disconnect: true },
          }),
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
    });

    sendSuccess({
      res,
      status: 200,
      message: 'brand.updated',
      data: { brand: mapBrand(brand as BrandRaw, { requesterId: userId, viewerRole: 'owner' }) },
    });
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
    const body = req.body as DeleteBrandInput;

    const existing = await prisma.brand.findUnique({ where: { id }, select: { owner_id: true } });
    if (!existing) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }
    if (!requireOwner(existing.owner_id, userId, next)) return;

    await requireStepUp({
      userId,
      purpose: getStepUpPurpose.deleteBrand,
      token: body.step_up_token,
    });

    // Cancel any pending brand transfers before deletion so foreign-key cascades
    // do not leave orphaned PENDING records.
    await prisma.brandTransfer.updateMany({
      where: { brand_id: id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    // Service-handling paths (transfer_services_to_self / transfer_services_to_other)
    // are not accepted by the schema until the Service domain is built. The only
    // supported operation is cascade-deletion, which the DB handles automatically
    // via the Brand→* Cascade relations.
    await prisma.brand.delete({ where: { id } });

    sendSuccess({ res, status: 200, message: 'brand.deleted' });
  } catch (err) {
    next(err);
  }
};

export const listPublicBrands = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const accountId = typeof req.query['account'] === 'string' ? req.query['account'] : undefined;

    if (accountId) {
      // Public account view: ACTIVE first (newest-first), then CLOSED (newest-first).
      // PENDING, REJECTED and any other non-public statuses are intentionally excluded.
      const [activeBrands, closedBrands] = await Promise.all([
        prisma.brand.findMany({
          where: { owner_id: accountId, status: 'ACTIVE' },
          select: brandSelect,
          orderBy: { created_at: 'desc' },
        }),
        prisma.brand.findMany({
          where: { owner_id: accountId, status: 'CLOSED' },
          select: brandSelect,
          orderBy: { created_at: 'desc' },
        }),
      ]);

      const brands = [...activeBrands, ...closedBrands];
      sendSuccess({
        res,
        status: 200,
        message: 'brand.list',
        data: { brands: brands.map((brand) => mapBrand(brand as BrandRaw)) },
      });
      return;
    }

    // Default public gallery: active brands only.
    const brands = await prisma.brand.findMany({
      where: { status: 'ACTIVE' },
      select: brandSelect,
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'brand.list',
      data: { brands: brands.map((brand) => mapBrand(brand as BrandRaw)) },
    });
  } catch (err) {
    next(err);
  }
};

export const upsertBrandRating = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUcr(req, next)) return;

    const id = req.params['id'] as string;
    const userId = req.user.sub;
    const body = req.body as UpsertBrandRatingInput;

    const brand = await prisma.brand.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!brand || brand.status !== 'ACTIVE') {
      return next(createError(404, 'brand.not_found'));
    }

    const ratingEligibility = await prisma.brandRatingEligibility.findFirst({
      where: { brand_id: id, user_id: userId },
      select: { completed_at: true },
      orderBy: { completed_at: 'desc' },
    });

    if (!hasCompletedReservationEligibility(ratingEligibility)) {
      return next(createError(403, 'brand.rating_requires_completed_reservation'));
    }

    await prisma.brandRating.upsert({
      where: {
        brand_id_user_id: {
          brand_id: id,
          user_id: userId,
        },
      },
      update: { value: body.value },
      create: {
        brand_id: id,
        user_id: userId,
        value: body.value,
      },
    });

    const updatedBrand = await prisma.brand.findUnique({
      where: { id },
      select: brandSelect,
    });

    if (!updatedBrand) {
      return next(createError(404, 'brand.not_found'));
    }

    sendSuccess({
      res,
      status: 200,
      message: 'brand.rating_saved',
      data: {
        brand: mapBrand(updatedBrand as BrandRaw, {
          requesterId: userId,
          viewerRole: 'public',
          canRate: true,
        }),
      },
    });
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
    if (!requireUso(req, next)) return;

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

    await ensureBrandSlotAvailable(userId);

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
    if (!requireUso(req, next)) return;

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
    if (!requireUso(req, next)) return;

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
    if (!requireUso(req, next)) return;

    const userId = req.user.sub;

    const transfers = await prisma.brandTransfer.findMany({
      where: { to_user_id: userId, status: 'PENDING' },
      include: {
        brand: { select: { id: true, name: true, logo_media: { select: { storage_path: true } } } },
        from_user: { select: { id: true, first_name: true, last_name: true, avatar_media: { select: { storage_path: true } } } },
        to_user: { select: { id: true, first_name: true, last_name: true, avatar_media: { select: { storage_path: true } } } },
      },
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'brand.transfer_list',
      data: {
        transfers: transfers.map((transfer) => ({
          id: transfer.id,
          brand_id: transfer.brand_id,
          from_user_id: transfer.from_user_id,
          to_user_id: transfer.to_user_id,
          status: transfer.status,
          created_at: transfer.created_at.toISOString(),
          updated_at: transfer.updated_at.toISOString(),
          brand: {
            id: transfer.brand.id,
            name: transfer.brand.name,
            logo_url: transfer.brand.logo_media?.storage_path
              ? buildFileUrl(transfer.brand.logo_media.storage_path)
              : null,
          },
          from_user: {
            id: transfer.from_user.id,
            first_name: transfer.from_user.first_name,
            last_name: transfer.from_user.last_name,
            avatar_url: transfer.from_user.avatar_media?.storage_path
              ? buildFileUrl(transfer.from_user.avatar_media.storage_path)
              : null,
          },
          to_user: {
            id: transfer.to_user.id,
            first_name: transfer.to_user.first_name,
            last_name: transfer.to_user.last_name,
            avatar_url: transfer.to_user.avatar_media?.storage_path
              ? buildFileUrl(transfer.to_user.avatar_media.storage_path)
              : null,
          },
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listOutgoingTransfers = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const userId = req.user.sub;

    // Include PENDING, ACCEPTED, and REJECTED so the sender can see the outcome.
    // Limit to transfers initiated in the last 30 days to keep the list manageable.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const transfers = await prisma.brandTransfer.findMany({
      where: {
        from_user_id: userId,
        status: { in: ['PENDING', 'ACCEPTED', 'REJECTED'] },
        created_at: { gte: thirtyDaysAgo },
      },
      include: {
        brand: { select: { id: true, name: true, logo_media: { select: { storage_path: true } } } },
        from_user: { select: { id: true, first_name: true, last_name: true, avatar_media: { select: { storage_path: true } } } },
        to_user: { select: { id: true, first_name: true, last_name: true, avatar_media: { select: { storage_path: true } } } },
      },
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'brand.transfer_list',
      data: {
        transfers: transfers.map((transfer) => ({
          id: transfer.id,
          brand_id: transfer.brand_id,
          from_user_id: transfer.from_user_id,
          to_user_id: transfer.to_user_id,
          status: transfer.status,
          created_at: transfer.created_at.toISOString(),
          updated_at: transfer.updated_at.toISOString(),
          brand: {
            id: transfer.brand.id,
            name: transfer.brand.name,
            logo_url: transfer.brand.logo_media?.storage_path
              ? buildFileUrl(transfer.brand.logo_media.storage_path)
              : null,
          },
          from_user: {
            id: transfer.from_user.id,
            first_name: transfer.from_user.first_name,
            last_name: transfer.from_user.last_name,
            avatar_url: transfer.from_user.avatar_media?.storage_path
              ? buildFileUrl(transfer.from_user.avatar_media.storage_path)
              : null,
          },
          to_user: {
            id: transfer.to_user.id,
            first_name: transfer.to_user.first_name,
            last_name: transfer.to_user.last_name,
            avatar_url: transfer.to_user.avatar_media?.storage_path
              ? buildFileUrl(transfer.to_user.avatar_media.storage_path)
              : null,
          },
        })),
      },
    });
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

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { owner_id: true, status: true },
    });
    if (!brand) {
      return next(createError(404, 'brand.not_found'));
    }
    if (!requireOwner(brand.owner_id, userId, next)) return;

    const body = req.body as CreateBranchInput;
    const mediaIds = [
      ...(body.cover_media_id ? [body.cover_media_id] : []),
      ...(body.interior_media_ids ?? []),
    ];

    if (!(await validateMediaOwnership(mediaIds, userId, next))) return;

    // Validate branch cover ownership + aspect ratio before entering the transaction
    if (!(await validateBranchCoverMediaOwnershipAndRatio(body.cover_media_id, userId, next))) return;

    const now = new Date();
    const branch = await prisma.$transaction(async (tx) => {
      const newBranch = await tx.branch.create({
        data: {
          brand_id: brandId,
          name: body.name,
          description: body.description,
          address1: body.address1,
          address2: body.address2,
          city: body.city,
          state: body.state,
          postal_code: body.postal_code,
          country: body.country,
          phone: body.phone,
          email: body.email,
          is_24_7: body.is_24_7 ?? false,
          opening: body.is_24_7 ? null : (body.opening ?? null),
          closing: body.is_24_7 ? null : (body.closing ?? null),
          cover_media_id: body.cover_media_id ?? null,
          breaks:
            body.breaks && body.breaks.length > 0
              ? { create: body.breaks.map((b) => ({ start: b.start, end: b.end })) }
              : undefined,
          interior_media:
            body.interior_media_ids && body.interior_media_ids.length > 0
              ? {
                  create: body.interior_media_ids.map((mediaId, index) => ({
                    media_id: mediaId,
                    order: index,
                  })),
                }
              : undefined,
        },
        select: branchSelect,
      });

      // Auto-create Team + OWNER membership for the new branch
      await tx.team.create({
        data: {
          branch_id: newBranch.id,
          created_by_user_id: userId,
          members: {
            create: {
              user_id: userId,
              invited_by_user_id: userId,
              role: 'OWNER',
              status: 'ACCEPTED',
            },
          },
        },
      });

      const moderationPatch = buildBrandResubmissionPatch(brand.status, now);
      if (Object.keys(moderationPatch).length > 0) {
        await tx.brand.update({
          where: { id: brandId },
          data: moderationPatch,
        });
      }

      return newBranch;
    });

    sendSuccess({ res, status: 201, message: 'branch.created', data: { branch: mapBranch(branch as BranchRaw) } });
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

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { owner_id: true, status: true },
    });
    if (!brand) {
      return next(createError(404, 'brand.not_found'));
    }
    if (!requireOwner(brand.owner_id, userId, next)) return;

    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        brand_id: true,
        is_24_7: true,
        opening: true,
        closing: true,
      },
    });

    if (!existingBranch || existingBranch.brand_id !== brandId) {
      return next(createError(404, 'branch.not_found'));
    }

    const body = req.body as UpdateBranchInput;
    const mediaIds = [
      ...(body.cover_media_id && body.cover_media_id !== null ? [body.cover_media_id] : []),
      ...(body.interior_media_ids ?? []),
    ];

    if (!(await validateMediaOwnership(mediaIds, userId, next))) return;

    // Validate branch cover ownership + ratio when cover_media_id is being changed
    if (body.cover_media_id !== undefined) {
      if (!(await validateBranchCoverMediaOwnershipAndRatio(body.cover_media_id, userId, next))) return;
    }

    const finalIs24_7 = body.is_24_7 ?? existingBranch.is_24_7;
    const finalOpening = finalIs24_7 ? null : (body.opening !== undefined ? body.opening : existingBranch.opening);
    const finalClosing = finalIs24_7 ? null : (body.closing !== undefined ? body.closing : existingBranch.closing);

    if (!finalIs24_7 && (!finalOpening || !finalClosing)) {
      return next(createError(400, 'branch.availability_required'));
    }

    const now = new Date();
    const branch = await prisma.$transaction(async (tx) => {
      if (body.breaks !== undefined) {
        await tx.branchBreak.deleteMany({ where: { branch_id: branchId } });
      }

      if (body.interior_media_ids !== undefined) {
        await tx.branchInteriorMedia.deleteMany({ where: { branch_id: branchId } });
      }

      const updatedBranch = await tx.branch.update({
        where: { id: branchId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.address1 !== undefined && { address1: body.address1 }),
          ...(body.address2 !== undefined && { address2: body.address2 }),
          ...(body.city !== undefined && { city: body.city }),
          ...(body.state !== undefined && { state: body.state }),
          ...(body.postal_code !== undefined && { postal_code: body.postal_code }),
          ...(body.country !== undefined && { country: body.country }),
          ...(body.phone !== undefined && { phone: body.phone }),
          ...(body.email !== undefined && { email: body.email }),
          ...(body.is_24_7 !== undefined && { is_24_7: body.is_24_7 }),
          ...(body.opening !== undefined && { opening: body.opening }),
          ...(body.closing !== undefined && { closing: body.closing }),
          ...(body.is_24_7 === true && { opening: null, closing: null }),
          ...(body.cover_media_id !== undefined && { cover_media_id: body.cover_media_id }),
          ...(body.breaks !== undefined &&
            body.breaks.length > 0 && {
              breaks: {
                create: body.breaks.map((b) => ({ start: b.start, end: b.end })),
              },
            }),
          ...(body.interior_media_ids !== undefined &&
            body.interior_media_ids.length > 0 && {
              interior_media: {
                create: body.interior_media_ids.map((mediaId, index) => ({
                  media_id: mediaId,
                  order: index,
                })),
              },
            }),
        },
        select: branchSelect,
      });

      const moderationPatch = buildBrandResubmissionPatch(brand.status, now);
      if (Object.keys(moderationPatch).length > 0) {
        await tx.brand.update({
          where: { id: brandId },
          data: moderationPatch,
        });
      }

      return updatedBranch;
    });

    sendSuccess({ res, status: 200, message: 'branch.updated', data: { branch: mapBranch(branch as BranchRaw) } });
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

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { owner_id: true, status: true },
    });
    if (!brand) {
      return next(createError(404, 'brand.not_found'));
    }
    if (!requireOwner(brand.owner_id, userId, next)) return;

    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, brand_id: true },
    });

    if (!existingBranch || existingBranch.brand_id !== brandId) {
      return next(createError(404, 'branch.not_found'));
    }

    const branchCount = await prisma.branch.count({ where: { brand_id: brandId } });
    if (branchCount <= 1) {
      return next(createError(400, 'brand.at_least_one_branch_required'));
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.branch.delete({ where: { id: branchId } });

      const moderationPatch = buildBrandResubmissionPatch(brand.status, now);
      if (Object.keys(moderationPatch).length > 0) {
        await tx.brand.update({
          where: { id: brandId },
          data: moderationPatch,
        });
      }
    });

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
