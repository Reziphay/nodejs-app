import prisma from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import { buildFileUrl } from './storage.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export async function getModerationQueue(type?: 'brand' | 'service') {
  const [brands, services] = await Promise.all([
    type === 'service'
      ? []
      : prisma.brand.findMany({
          where: { status: 'PENDING' },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            created_at: true,
            updated_at: true,
            owner: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
            logo_media: { select: { id: true, storage_path: true } },
          },
          orderBy: { created_at: 'asc' },
        }),
    type === 'brand'
      ? []
      : prisma.service.findMany({
          where: { status: 'PENDING' },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            category: true,
            price: true,
            price_type: true,
            created_at: true,
            updated_at: true,
            owner: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
          orderBy: { created_at: 'asc' },
        }),
  ]);

  return {
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description ?? undefined,
      status: b.status,
      logo_url: b.logo_media ? buildFileUrl(b.logo_media.storage_path) : null,
      owner: b.owner,
      created_at: b.created_at.toISOString(),
      updated_at: b.updated_at.toISOString(),
    })),
    services: services.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? undefined,
      status: s.status,
      category: s.category ?? undefined,
      price: s.price ? Number(s.price) : null,
      price_type: s.price_type,
      owner: s.owner,
      created_at: s.created_at.toISOString(),
      updated_at: s.updated_at.toISOString(),
    })),
  };
}

// ─── Brand detail ─────────────────────────────────────────────────────────────

export async function getBrandModerationDetail(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      owner: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          type: true,
          created_at: true,
        },
      },
      logo_media: { select: { id: true, storage_path: true } },
      gallery: {
        select: {
          id: true,
          media_id: true,
          order: true,
          media: { select: { id: true, storage_path: true } },
        },
        orderBy: { order: 'asc' },
      },
      branches: {
        include: {
          cover_media: { select: { id: true, storage_path: true } },
          breaks: { select: { id: true, start: true, end: true } },
        },
        orderBy: { created_at: 'asc' },
      },
      categories: { select: { id: true, name: true } },
    },
  });

  if (!brand) return null;

  return {
    id: brand.id,
    name: brand.name,
    description: brand.description ?? undefined,
    status: brand.status,
    rejection_reason: (brand as { rejection_reason?: string | null }).rejection_reason ?? undefined,
    owner: brand.owner,
    logo_url: brand.logo_media ? buildFileUrl(brand.logo_media.storage_path) : null,
    gallery: brand.gallery.map((g) => ({
      id: g.id,
      media_id: g.media_id,
      order: g.order,
      url: buildFileUrl(g.media.storage_path),
    })),
    branches: brand.branches.map((br) => ({
      id: br.id,
      name: br.name,
      description: br.description ?? undefined,
      address1: br.address1,
      address2: br.address2 ?? undefined,
      phone: br.phone ?? undefined,
      email: br.email ?? undefined,
      is_24_7: br.is_24_7,
      opening: br.opening ?? undefined,
      closing: br.closing ?? undefined,
      cover_url: br.cover_media ? buildFileUrl(br.cover_media.storage_path) : null,
      breaks: br.breaks,
      created_at: br.created_at.toISOString(),
      updated_at: br.updated_at.toISOString(),
    })),
    categories: brand.categories,
    created_at: brand.created_at.toISOString(),
    updated_at: brand.updated_at.toISOString(),
  };
}

// ─── Service detail ───────────────────────────────────────────────────────────

export async function getServiceModerationDetail(serviceId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: {
      owner: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          type: true,
          created_at: true,
        },
      },
      images: {
        select: {
          id: true,
          media_id: true,
          order: true,
          media: { select: { id: true, storage_path: true } },
        },
        orderBy: { order: 'asc' },
      },
      branch: {
        select: {
          id: true,
          name: true,
          address1: true,
          brand: { select: { id: true, name: true } },
        },
      },
      service_category: { select: { id: true, key: true } },
    },
  });

  if (!service) return null;

  return {
    id: service.id,
    title: service.title,
    description: service.description ?? undefined,
    status: service.status,
    rejection_reason: service.rejection_reason ?? undefined,
    service_category_id: service.service_category_id ?? null,
    service_category: service.service_category ?? null,
    price: service.price ? Number(service.price) : null,
    price_type: service.price_type,
    duration: service.duration ?? undefined,
    address: service.address ?? undefined,
    owner: service.owner,
    images: service.images.map((img) => ({
      id: img.id,
      media_id: img.media_id,
      order: img.order,
      url: buildFileUrl(img.media.storage_path),
    })),
    branch: service.branch
      ? {
          id: service.branch.id,
          name: service.branch.name,
          address1: service.branch.address1,
          brand: service.branch.brand,
        }
      : null,
    created_at: service.created_at.toISOString(),
    updated_at: service.updated_at.toISOString(),
  };
}

// ─── Brand moderation actions ─────────────────────────────────────────────────

export async function approveBrand(
  brandId: string,
  reviewerId: string,
  checklist?: ChecklistItem[],
) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, status: true, owner_id: true, name: true },
  });

  if (!brand) return { notFound: true } as const;
  if (brand.status !== 'PENDING') return { wrongStatus: true } as const;

  await prisma.$transaction([
    prisma.brand.update({
      where: { id: brandId },
      data: { status: 'ACTIVE', rejection_reason: null },
    }),
    prisma.moderationReview.create({
      data: {
        entity_type: 'brand',
        entity_id: brandId,
        reviewer_id: reviewerId,
        outcome: 'APPROVED',
        rejection_reason: null,
        checklist: checklist ? (checklist as unknown as Prisma.InputJsonValue) : undefined,
      },
    }),
    prisma.notification.create({
      data: {
        user_id: brand.owner_id,
        type: 'brand_approved',
        title: 'Brand approved',
        body: `Your brand "${brand.name}" has been approved and is now active.`,
        data: { brand_id: brandId },
      },
    }),
  ]);

  return { ok: true } as const;
}

export async function rejectBrand(
  brandId: string,
  reviewerId: string,
  rejectionReason: string,
  checklist?: ChecklistItem[],
) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, status: true, owner_id: true, name: true },
  });

  if (!brand) return { notFound: true } as const;
  if (brand.status !== 'PENDING') return { wrongStatus: true } as const;

  await prisma.$transaction([
    prisma.brand.update({
      where: { id: brandId },
      data: { status: 'REJECTED', rejection_reason: rejectionReason },
    }),
    prisma.moderationReview.create({
      data: {
        entity_type: 'brand',
        entity_id: brandId,
        reviewer_id: reviewerId,
        outcome: 'REJECTED',
        rejection_reason: rejectionReason,
        checklist: checklist ? (checklist as unknown as Prisma.InputJsonValue) : undefined,
      },
    }),
    prisma.notification.create({
      data: {
        user_id: brand.owner_id,
        type: 'brand_rejected',
        title: 'Brand rejected',
        body: `Your brand "${brand.name}" has been rejected. Reason: ${rejectionReason}`,
        data: { brand_id: brandId },
      },
    }),
  ]);

  return { ok: true } as const;
}

// ─── Service moderation actions ───────────────────────────────────────────────

export async function approveService(
  serviceId: string,
  reviewerId: string,
  checklist?: ChecklistItem[],
) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, status: true, owner_id: true, title: true },
  });

  if (!service) return { notFound: true } as const;
  if (service.status !== 'PENDING') return { wrongStatus: true } as const;

  await prisma.$transaction([
    prisma.service.update({
      where: { id: serviceId },
      data: { status: 'ACTIVE', rejection_reason: null },
    }),
    prisma.moderationReview.create({
      data: {
        entity_type: 'service',
        entity_id: serviceId,
        reviewer_id: reviewerId,
        outcome: 'APPROVED',
        rejection_reason: null,
        checklist: checklist ? (checklist as unknown as Prisma.InputJsonValue) : undefined,
      },
    }),
    prisma.notification.create({
      data: {
        user_id: service.owner_id,
        type: 'service_approved',
        title: 'Service approved',
        body: `Your service "${service.title}" has been approved and is now active.`,
        data: { service_id: serviceId },
      },
    }),
  ]);

  return { ok: true } as const;
}

export async function rejectService(
  serviceId: string,
  reviewerId: string,
  rejectionReason: string,
  checklist?: ChecklistItem[],
) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, status: true, owner_id: true, title: true },
  });

  if (!service) return { notFound: true } as const;
  if (service.status !== 'PENDING') return { wrongStatus: true } as const;

  await prisma.$transaction([
    prisma.service.update({
      where: { id: serviceId },
      data: { status: 'REJECTED', rejection_reason: rejectionReason },
    }),
    prisma.moderationReview.create({
      data: {
        entity_type: 'service',
        entity_id: serviceId,
        reviewer_id: reviewerId,
        outcome: 'REJECTED',
        rejection_reason: rejectionReason,
        checklist: checklist ? (checklist as unknown as Prisma.InputJsonValue) : undefined,
      },
    }),
    prisma.notification.create({
      data: {
        user_id: service.owner_id,
        type: 'service_rejected',
        title: 'Service rejected',
        body: `Your service "${service.title}" has been rejected. Reason: ${rejectionReason}`,
        data: { service_id: serviceId },
      },
    }),
  ]);

  return { ok: true } as const;
}
