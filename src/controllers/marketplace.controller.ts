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
        where: { services: { some: { status: 'ACTIVE' } } },
        select: {
          id: true,
          key: true,
          _count: { select: { services: { where: { status: 'ACTIVE' } } } },
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
            where: {
              status: 'ACTIVE',
              ...(category && { service_category_id: category }),
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
                { service_category: { key: { contains: q, mode: 'insensitive' } } },
              ],
            },
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
                    { services: { some: { status: 'ACTIVE' } } },
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
            where: { status: 'ACTIVE', address: { contains: q, mode: 'insensitive' } },
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
      ...ratingSummary(service.ratings),
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
