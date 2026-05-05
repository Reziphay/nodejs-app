import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../middlewares/error.middleware';
import { buildFileUrl } from '../services/storage.service';
import { sendSuccess } from '../utils/response';

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

function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

function publicServiceWhere(extra: Record<string, unknown> = {}) {
  const { AND, ...rest } = extra as { AND?: unknown } & Record<string, unknown>;
  return {
    status: 'ACTIVE' as const,
    ...rest,
    AND: [
      {
        OR: [
          { branch_id: null },
          { branch: { brand: { status: 'ACTIVE' as const } } },
        ],
      },
      ...(AND ? (Array.isArray(AND) ? AND : [AND]) : []),
    ],
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
  cover_media_id: true,
  created_at: true,
  updated_at: true,
  breaks: { select: { id: true, start: true, end: true } },
  cover_media: { select: { id: true, storage_path: true } },
} as const;

const brandSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  owner_id: true,
  logo_media_id: true,
  instagram_url: true,
  facebook_url: true,
  youtube_url: true,
  whatsapp_url: true,
  linkedin_url: true,
  x_url: true,
  website_url: true,
  created_at: true,
  updated_at: true,
  categories: { select: { id: true, key: true } },
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
  branches: { select: branchSelect },
  ratings: {
    select: {
      value: true,
      user_id: true,
    },
  },
} as const;

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
  ratings: {
    select: {
      value: true,
      user_id: true,
    },
  },
  branch: {
    select: {
      id: true,
      brand: { select: brandSelect },
    },
  },
} as const;

function mapBranch(raw: any) {
  return {
    id: raw.id,
    brand_id: raw.brand_id,
    name: raw.name,
    description: raw.description ?? undefined,
    address1: raw.address1,
    address2: raw.address2 ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
    is_24_7: raw.is_24_7,
    opening: raw.opening ?? undefined,
    closing: raw.closing ?? undefined,
    cover_media_id: raw.cover_media_id ?? null,
    cover_url: raw.cover_media ? buildFileUrl(raw.cover_media.storage_path) : null,
    breaks: raw.breaks ?? [],
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

function mapBrand(raw: any, requesterId?: string) {
  const ratingCount = raw.ratings?.length ?? 0;
  const ratingAverage =
    ratingCount > 0
      ? roundRating(raw.ratings.reduce((sum: number, rating: { value: number }) => sum + rating.value, 0) / ratingCount)
      : null;
  const myRating =
    requesterId
      ? raw.ratings?.find((rating: { user_id: string }) => rating.user_id === requesterId)?.value ?? null
      : null;

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    status: raw.status,
    owner_id: raw.owner_id,
    logo_url: raw.logo_media ? buildFileUrl(raw.logo_media.storage_path) : undefined,
    categories: raw.categories ?? [],
    gallery: (raw.gallery ?? []).map((g: any) => ({
      id: g.id,
      media_id: g.media_id,
      order: g.order,
      url: buildFileUrl(g.media.storage_path),
    })),
    branches: (raw.branches ?? []).map(mapBranch),
    instagram_url: raw.instagram_url ?? undefined,
    facebook_url: raw.facebook_url ?? undefined,
    youtube_url: raw.youtube_url ?? undefined,
    whatsapp_url: raw.whatsapp_url ?? undefined,
    linkedin_url: raw.linkedin_url ?? undefined,
    x_url: raw.x_url ?? undefined,
    website_url: raw.website_url ?? undefined,
    rating: ratingAverage,
    rating_count: ratingCount,
    my_rating: myRating,
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

function mapService(raw: any, requesterId?: string) {
  const myRating =
    requesterId
      ? raw.ratings?.find((rating: { user_id: string }) => rating.user_id === requesterId)?.value ?? null
      : null;

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
    images: (raw.images ?? []).map((img: any) => ({
      id: img.id,
      media_id: img.media_id,
      order: img.order,
      url: buildFileUrl(img.media.storage_path),
    })),
    rating: null,
    rating_count: 0,
    my_rating: myRating,
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

export const listFavorites = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUcr(req, next)) return;

    const userId = req.user.sub;
    const [favoriteBrands, favoriteServices] = await Promise.all([
      prisma.favoriteBrand.findMany({
        where: { user_id: userId, brand: { status: 'ACTIVE' } },
        include: { brand: { select: brandSelect } },
        orderBy: { created_at: 'desc' },
      }),
      prisma.favoriteService.findMany({
        where: { user_id: userId, service: publicServiceWhere() },
        include: { service: { select: serviceSelect } },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const serviceBrandMap = new Map<string, any>();
    for (const favorite of favoriteServices) {
      const brand = (favorite.service as any).branch?.brand;
      if (brand) serviceBrandMap.set(brand.id, brand);
    }

    sendSuccess({
      res,
      status: 200,
      message: 'favorite.list',
      data: {
        brands: favoriteBrands.map((favorite) => mapBrand((favorite as any).brand, userId)),
        services: favoriteServices.map((favorite) => mapService((favorite as any).service, userId)),
        service_brands: [...serviceBrandMap.values()].map((brand) => mapBrand(brand, userId)),
        brand_ids: favoriteBrands.map((favorite) => favorite.brand_id),
        service_ids: favoriteServices.map((favorite) => favorite.service_id),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const addFavoriteBrand = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUcr(req, next)) return;

    const userId = req.user.sub;
    const brandId = req.params['id'] as string;
    const brand = await prisma.brand.findFirst({ where: { id: brandId, status: 'ACTIVE' }, select: { id: true } });

    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    await prisma.favoriteBrand.upsert({
      where: { user_id_brand_id: { user_id: userId, brand_id: brandId } },
      update: {},
      create: { user_id: userId, brand_id: brandId },
    });

    sendSuccess({ res, status: 200, message: 'favorite.brand_added', data: { favorite: true, id: brandId } });
  } catch (err) {
    next(err);
  }
};

export const removeFavoriteBrand = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUcr(req, next)) return;

    const userId = req.user.sub;
    const brandId = req.params['id'] as string;

    await prisma.favoriteBrand.deleteMany({ where: { user_id: userId, brand_id: brandId } });

    sendSuccess({ res, status: 200, message: 'favorite.brand_removed', data: { favorite: false, id: brandId } });
  } catch (err) {
    next(err);
  }
};

export const addFavoriteService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUcr(req, next)) return;

    const userId = req.user.sub;
    const serviceId = req.params['id'] as string;
    const service = await prisma.service.findFirst({ where: publicServiceWhere({ id: serviceId }), select: { id: true } });

    if (!service) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    await prisma.favoriteService.upsert({
      where: { user_id_service_id: { user_id: userId, service_id: serviceId } },
      update: {},
      create: { user_id: userId, service_id: serviceId },
    });

    sendSuccess({ res, status: 200, message: 'favorite.service_added', data: { favorite: true, id: serviceId } });
  } catch (err) {
    next(err);
  }
};

export const removeFavoriteService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUcr(req, next)) return;

    const userId = req.user.sub;
    const serviceId = req.params['id'] as string;

    await prisma.favoriteService.deleteMany({ where: { user_id: userId, service_id: serviceId } });

    sendSuccess({ res, status: 200, message: 'favorite.service_removed', data: { favorite: false, id: serviceId } });
  } catch (err) {
    next(err);
  }
};
