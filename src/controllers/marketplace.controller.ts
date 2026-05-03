import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';

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
