import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { buildFileUrl } from '../services/storage.service';

export const getMarketplaceFacets = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const [serviceCategories, brandCategories] = await Promise.all([
      prisma.serviceCategory.findMany({
        where: { services: { some: publicServiceWhere() } },
        select: {
          id: true,
          key: true,
          _count: { select: { services: { where: publicServiceWhere() } } },
        },
        orderBy: { key: 'asc' },
      }),
      prisma.brandCategory.findMany({
        where: { brands: { some: { status: 'ACTIVE' } } },
        select: {
          id: true,
          key: true,
          _count: { select: { brands: { where: { status: 'ACTIVE' } } } },
        },
        orderBy: { key: 'asc' },
      }),
    ]);

    sendSuccess({
      res,
      status: 200,
      message: 'marketplace.facets',
      data: {
        service_categories: serviceCategories.map((c) => ({
          id: c.id,
          key: c.key,
          count: c._count.services,
        })),
        brand_categories: brandCategories.map((c) => ({
          id: c.id,
          key: c.key,
          count: c._count.brands,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

function imageUrl(storagePath?: string | null) {
  return storagePath ? buildFileUrl(storagePath) : null;
}

function ratingSummary(ratings: { value: number }[]) {
  if (ratings.length === 0) return { rating: null, rating_count: 0 };
  return {
    rating: roundRating(ratings.reduce((sum, rating) => sum + rating.value, 0) / ratings.length),
    rating_count: ratings.length,
  };
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function publicServiceWhere(extra: Record<string, unknown> = {}) {
  const { AND, ...rest } = extra as { AND?: unknown } & Record<string, unknown>;
  const andClauses = [
    {
      OR: [
        { brand_id: null },
        { brand: { status: 'ACTIVE' as const } },
      ],
    },
    ...(AND ? (Array.isArray(AND) ? AND : [AND]) : []),
  ];

  return {
    status: 'ACTIVE' as const,
    ...rest,
    AND: andClauses,
  };
}

const homeBrandSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  owner_id: true,
  created_at: true,
  updated_at: true,
  logo_media: { select: { storage_path: true } },
  categories: { select: { id: true, key: true } },
  gallery: {
    select: {
      id: true,
      media_id: true,
      order: true,
      media: { select: { storage_path: true } },
    },
    orderBy: { order: 'asc' as const },
  },
  ratings: { select: { value: true, user_id: true } },
} as const;

const homeServiceSelect = {
  id: true,
  title: true,
  description: true,
  owner_id: true,
  brand_id: true,
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
      media: { select: { storage_path: true } },
    },
    orderBy: { order: 'asc' as const },
  },
  ratings: { select: { value: true, user_id: true } },
  brand: {
    select: {
      id: true,
      name: true,
      owner_id: true,
      logo_media: { select: { storage_path: true } },
      ratings: { select: { value: true } },
    },
  },
} as const;

function mapHomeBrand(raw: any, requesterId?: string) {
  const summary = ratingSummary(raw.ratings ?? []);
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    status: raw.status,
    owner_id: raw.owner_id,
    logo_url: imageUrl(raw.logo_media?.storage_path) ?? undefined,
    categories: raw.categories ?? [],
    gallery: (raw.gallery ?? []).map((item: any) => ({
      id: item.id,
      media_id: item.media_id,
      order: item.order,
      url: buildFileUrl(item.media.storage_path),
    })),
    rating: summary.rating,
    rating_count: summary.rating_count,
    my_rating: requesterId
      ? raw.ratings?.find((rating: { user_id: string }) => rating.user_id === requesterId)?.value ?? null
      : null,
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

function mapHomeService(raw: any, requesterId?: string) {
  const brandSummary = ratingSummary(raw.brand?.ratings ?? []);
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
          logo_url: imageUrl(raw.brand.logo_media?.storage_path) ?? undefined,
          rating: brandSummary.rating,
          rating_count: brandSummary.rating_count,
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
    images: (raw.images ?? []).map((item: any) => ({
      id: item.id,
      media_id: item.media_id,
      order: item.order,
      url: buildFileUrl(item.media.storage_path),
    })),
    rating: null,
    rating_count: 0,
    my_rating: requesterId
      ? raw.ratings?.find((rating: { user_id: string }) => rating.user_id === requesterId)?.value ?? null
      : null,
    created_at: raw.created_at.toISOString(),
    updated_at: raw.updated_at.toISOString(),
  };
}

async function randomServiceIds(limit: number) {
  return prisma.$queryRaw<{ id: string }[]>`
    SELECT service.id
    FROM "Service" service
    LEFT JOIN "Brand" brand ON brand.id = service.brand_id
    WHERE service.status = 'ACTIVE'
      AND (service.brand_id IS NULL OR brand.status = 'ACTIVE')
    ORDER BY RANDOM()
    LIMIT ${limit}
  `;
}

async function randomBrandIds(limit: number) {
  return prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Brand"
    WHERE status = 'ACTIVE'
    ORDER BY RANDOM()
    LIMIT ${limit}
  `;
}

async function servicesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const order = new Map(ids.map((id, index) => [id, index]));
  const services = await prisma.service.findMany({
    where: publicServiceWhere({ id: { in: ids } }),
    select: homeServiceSelect,
  });
  return services.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function brandsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const order = new Map(ids.map((id, index) => [id, index]));
  const brands = await prisma.brand.findMany({
    where: { id: { in: ids }, status: 'ACTIVE' },
    select: homeBrandSelect,
  });
  return brands.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function topRated<T extends { ratings: { value: number }[]; created_at: Date }>(items: T[]) {
  return [...items].sort((a, b) => {
    const ar = ratingSummary(a.ratings);
    const br = ratingSummary(b.ratings);
    return (br.rating ?? 0) - (ar.rating ?? 0) || br.rating_count - ar.rating_count || b.created_at.getTime() - a.created_at.getTime();
  });
}

export const getMarketplaceHome = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.sub;

    const [randomServiceRows, recentServices, recentBrands, topBrandPool, favoriteServices, favoriteBrands, usoPool] =
      await Promise.all([
        randomServiceIds(20),
        prisma.service.findMany({
          where: publicServiceWhere(),
          select: homeServiceSelect,
          orderBy: { created_at: 'desc' },
          take: 10,
        }),
        prisma.brand.findMany({
          where: { status: 'ACTIVE' },
          select: homeBrandSelect,
          orderBy: { created_at: 'desc' },
          take: 10,
        }),
        prisma.brand.findMany({
          where: { status: 'ACTIVE', ratings: { some: {} } },
          select: homeBrandSelect,
          orderBy: { created_at: 'desc' },
          take: 160,
        }),
        userId
          ? prisma.favoriteService.findMany({
              where: { user_id: userId, service: publicServiceWhere() },
              select: {
                service_id: true,
                service: {
                  select: {
                    service_category_id: true,
                    brand: { select: { categories: { select: { id: true } } } },
                  },
                },
              },
              orderBy: { created_at: 'desc' },
              take: 20,
            })
          : Promise.resolve([]),
        userId
          ? prisma.favoriteBrand.findMany({
              where: { user_id: userId, brand: { status: 'ACTIVE' } },
              select: { brand_id: true, brand: { select: { categories: { select: { id: true } } } } },
              orderBy: { created_at: 'desc' },
              take: 20,
            })
          : Promise.resolve([]),
        prisma.user.findMany({
          where: {
            type: 'uso',
            OR: [{ brands: { some: { status: 'ACTIVE' } } }, { services: { some: publicServiceWhere() } }],
          },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            avatar_media: { select: { storage_path: true } },
            brands: { where: { status: 'ACTIVE' }, select: { ratings: { select: { value: true } } } },
            services: { where: publicServiceWhere(), select: { id: true } },
          },
          take: 160,
        }),
      ]);

    const randomServices = await servicesByIds(randomServiceRows.map((row) => row.id));
    const serviceCategoryIds = [
      ...new Set(favoriteServices.map((favorite: any) => favorite.service.service_category_id).filter(Boolean)),
    ];
    const brandCategoryIds = [
      ...new Set([
        ...favoriteBrands.flatMap((favorite: any) => favorite.brand.categories.map((category: { id: string }) => category.id)),
        ...favoriteServices.flatMap((favorite: any) =>
          favorite.service.brand?.categories.map((category: { id: string }) => category.id) ?? [],
        ),
      ]),
    ];

    const [recommendedServicePool, recommendedBrandPool] = await Promise.all([
      serviceCategoryIds.length > 0
        ? prisma.service.findMany({
            where: publicServiceWhere({
              service_category_id: { in: serviceCategoryIds },
              id: { notIn: favoriteServices.map((favorite: any) => favorite.service_id) },
            }),
            select: homeServiceSelect,
            take: 80,
          })
        : servicesByIds((await randomServiceIds(20)).map((row) => row.id)),
      brandCategoryIds.length > 0
        ? prisma.brand.findMany({
            where: {
              status: 'ACTIVE',
              categories: { some: { id: { in: brandCategoryIds } } },
              id: { notIn: favoriteBrands.map((favorite: any) => favorite.brand_id) },
            },
            select: homeBrandSelect,
            take: 60,
          })
        : brandsByIds((await randomBrandIds(20)).map((row) => row.id)),
    ]);

    const topUsos = usoPool
      .map((user) => {
        const ratings = [
          ...user.brands.flatMap((brand) => brand.ratings),
        ];
        return {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          type: 'uso',
          avatar_url: imageUrl(user.avatar_media?.storage_path),
          ...ratingSummary(ratings),
        };
      })
      .filter((user) => user.rating !== null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.rating_count - a.rating_count)
      .slice(0, 10);

    sendSuccess({
      res,
      status: 200,
      message: 'marketplace.home',
      data: {
        random_services: randomServices.slice(0, 10).map((service) => mapHomeService(service, userId)),
        smart_services: randomServices.slice(10, 20).map((service) => mapHomeService(service, userId)),
        recent_services: recentServices.map((service) => mapHomeService(service, userId)),
        recent_brands: recentBrands.map((brand) => mapHomeBrand(brand, userId)),
        recommended_services: shuffle(recommendedServicePool).slice(0, 10).map((service) => mapHomeService(service, userId)),
        recommended_brands: shuffle(recommendedBrandPool).slice(0, 10).map((brand) => mapHomeBrand(brand, userId)),
        top_rated_services: [],
        top_rated_brands: topRated(topBrandPool).slice(0, 10).map((brand) => mapHomeBrand(brand, userId)),
        top_usos: topUsos,
      },
    });
  } catch (err) {
    next(err);
  }
};

function parseSearchLimit(value: unknown, fallback = 8) {
  return Math.min(40, Math.max(1, Number.parseInt(String(value ?? fallback), 10) || fallback));
}

function buildSearchHref(type: string, id: string, brandId?: string | null) {
  if (type === 'brand') return `/brands?id=${id}`;
  if (type === 'branch') return brandId ? `/brands?id=${brandId}` : '/brands';
  if (type === 'service') return `/services?id=${id}`;
  if (type === 'uso') return `/account?id=${id}`;
  if (type === 'address') return brandId ? `/brands?id=${brandId}` : `/services?id=${id}`;
  return '/search';
}

function searchNeedle(req: Request) {
  return String(req.query['q'] ?? req.query['query'] ?? req.query['queary'] ?? '').trim();
}

export const searchMarketplace = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const q = searchNeedle(req);
    const type = typeof req.query['type'] === 'string' ? req.query['type'] : 'all';
    const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
    const sort = typeof req.query['sort'] === 'string' ? req.query['sort'] : 'relevance';
    const limit = parseSearchLimit(req.query['limit'], 12);

    if (q.length < 2) {
      sendSuccess({
        res,
        status: 200,
        message: 'marketplace.search',
        data: { query: q, suggestions: [], results: { brands: [], branches: [], services: [], users: [], addresses: [] } },
      });
      return;
    }

    const include = (kind: string) => type === 'all' || type === kind;

    const [brands, branches, services, users, addressBranches, addressServices] = await Promise.all([
      include('brand')
        ? prisma.brand.findMany({
            where: {
              status: 'ACTIVE',
              ...(category && { categories: { some: { id: category } } }),
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { categories: { some: { key: { contains: q, mode: 'insensitive' } } } },
              ],
            },
            select: {
              id: true,
              name: true,
              description: true,
              owner_id: true,
              logo_media: { select: { storage_path: true } },
              gallery: {
                select: { media: { select: { storage_path: true } } },
                orderBy: { order: 'asc' },
                take: 1,
              },
              categories: { select: { id: true, key: true } },
              ratings: { select: { value: true } },
            },
            take: limit,
          })
        : Promise.resolve([]),
      include('branch')
        ? prisma.branch.findMany({
            where: {
              brand: { status: 'ACTIVE' },
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { address1: { contains: q, mode: 'insensitive' } },
                { address2: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              brand_id: true,
              name: true,
              address1: true,
              address2: true,
              cover_media: { select: { storage_path: true } },
              brand: {
                select: {
                  name: true,
                  categories: { select: { id: true, key: true } },
                  logo_media: { select: { storage_path: true } },
                },
              },
            },
            take: limit,
          })
        : Promise.resolve([]),
      include('service')
        ? prisma.service.findMany({
            where: publicServiceWhere({
              ...(category && { service_category_id: category }),
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
                { service_category: { key: { contains: q, mode: 'insensitive' } } },
              ],
            }),
            select: {
              id: true,
              title: true,
              description: true,
              owner_id: true,
              service_category: { select: { id: true, key: true } },
              images: {
                select: { media: { select: { storage_path: true } } },
                orderBy: { order: 'asc' },
                take: 1,
              },
              ratings: { select: { value: true } },
            },
            take: limit,
          })
        : Promise.resolve([]),
      include('uso')
        ? prisma.user.findMany({
            where: {
              type: 'uso',
              AND: [
                {
                  OR: [
                    { brands: { some: { status: 'ACTIVE' } } },
                    { services: { some: publicServiceWhere() } },
                  ],
                },
              ],
              OR: [
                { first_name: { contains: q, mode: 'insensitive' } },
                { last_name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              avatar_media: { select: { storage_path: true } },
            },
            take: limit,
          })
        : Promise.resolve([]),
      include('address')
        ? prisma.branch.findMany({
            where: {
              brand: { status: 'ACTIVE' },
              OR: [
                { address1: { contains: q, mode: 'insensitive' } },
                { address2: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: { id: true, brand_id: true, name: true, address1: true, address2: true, brand: { select: { name: true } } },
            take: limit,
          })
        : Promise.resolve([]),
      include('address')
        ? prisma.service.findMany({
            where: publicServiceWhere({ address: { contains: q, mode: 'insensitive' } }),
            select: { id: true, title: true, address: true },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    const brandItems = brands.map((brand) => ({
      id: brand.id,
      type: 'brand',
      title: brand.name,
      subtitle: brand.description ?? brand.categories[0]?.key ?? '',
      image_url: imageUrl(brand.logo_media?.storage_path) ?? imageUrl(brand.gallery[0]?.media.storage_path),
      href: buildSearchHref('brand', brand.id),
      category_id: brand.categories[0]?.id ?? null,
      category_key: brand.categories[0]?.key ?? null,
      ...ratingSummary(brand.ratings),
    }));
    const branchItems = branches.map((branch) => ({
      id: branch.id,
      type: 'branch',
      title: branch.name,
      subtitle: `${branch.brand.name} · ${[branch.address1, branch.address2].filter(Boolean).join(', ')}`,
      image_url: imageUrl(branch.cover_media?.storage_path) ?? imageUrl(branch.brand.logo_media?.storage_path),
      href: buildSearchHref('branch', branch.id, branch.brand_id),
      category_id: branch.brand.categories[0]?.id ?? null,
      category_key: branch.brand.categories[0]?.key ?? null,
      rating: null,
      rating_count: 0,
    }));
    const serviceItems = services.map((service) => ({
      id: service.id,
      type: 'service',
      title: service.title,
      subtitle: service.description ?? service.service_category?.key ?? '',
      image_url: imageUrl(service.images[0]?.media.storage_path),
      href: buildSearchHref('service', service.id),
      category_id: service.service_category?.id ?? null,
      category_key: service.service_category?.key ?? null,
      rating: null,
      rating_count: 0,
    }));
    const userItems = users.map((user) => ({
      id: user.id,
      type: 'uso',
      title: `${user.first_name} ${user.last_name}`.trim(),
      subtitle: user.email,
      image_url: imageUrl(user.avatar_media?.storage_path),
      href: buildSearchHref('uso', user.id),
      category_id: null,
      category_key: null,
      rating: null,
      rating_count: 0,
    }));
    const addressItems = [
      ...addressBranches.map((branch) => ({
        id: `branch-address-${branch.id}`,
        type: 'address',
        title: [branch.address1, branch.address2].filter(Boolean).join(', '),
        subtitle: `${branch.brand.name} · ${branch.name}`,
        image_url: null,
        href: buildSearchHref('address', branch.id, branch.brand_id),
        category_id: null,
        category_key: null,
        rating: null,
        rating_count: 0,
      })),
      ...addressServices.map((service) => ({
        id: `service-address-${service.id}`,
        type: 'address',
        title: service.address ?? '',
        subtitle: service.title,
        image_url: null,
        href: buildSearchHref('address', service.id),
        category_id: null,
        category_key: null,
        rating: null,
        rating_count: 0,
      })),
    ];

    const sortByRating = (items: any[]) =>
      sort === 'rating_desc'
        ? [...items].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.rating_count ?? 0) - (a.rating_count ?? 0))
        : items;

    const suggestions = [...brandItems, ...branchItems, ...serviceItems, ...userItems, ...addressItems].slice(0, limit);

    sendSuccess({
      res,
      status: 200,
      message: 'marketplace.search',
      data: {
        query: q,
        suggestions,
        results: {
          brands: sortByRating(brandItems),
          branches: branchItems,
          services: sortByRating(serviceItems),
          users: userItems,
          addresses: addressItems,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
