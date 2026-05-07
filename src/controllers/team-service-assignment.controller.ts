import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { buildFileUrl } from '../services/storage.service';
import { ServiceStatus } from '../generated/prisma/enums';

// Statuses that hide a service from member-facing assignment UI.
const HIDDEN_FROM_MEMBERS: ServiceStatus[] = [
  ServiceStatus.DRAFT,
  ServiceStatus.REJECTED,
  ServiceStatus.ARCHIVED,
];

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

const assignmentSelect = {
  id: true,
  team_member_id: true,
  service_id: true,
  status: true,
  initiated_by: true,
  proposed_description: true,
  proposed_price: true,
  proposed_duration: true,
  responded_at: true,
  created_at: true,
  updated_at: true,
} as const;

type AssignmentRow = {
  id: string;
  team_member_id: string;
  service_id: string;
  status: string;
  initiated_by: string;
  proposed_description: string | null;
  proposed_price: unknown | null;
  proposed_duration: number | null;
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapAssignment(a: AssignmentRow) {
  return {
    id: a.id,
    team_member_id: a.team_member_id,
    service_id: a.service_id,
    status: a.status,
    initiated_by: a.initiated_by,
    proposed_description: a.proposed_description ?? null,
    proposed_price: a.proposed_price == null ? null : Number(a.proposed_price),
    proposed_duration: a.proposed_duration ?? null,
    responded_at: a.responded_at?.toISOString() ?? null,
    created_at: a.created_at.toISOString(),
    updated_at: a.updated_at.toISOString(),
  };
}

function coerceOptionalText(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 4000) : null;
}

function coerceOptionalPrice(value: unknown, fallback: unknown | null): number | null {
  if (value === '' || value === null || value === undefined) {
    return fallback == null ? null : Number(fallback);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback == null ? null : Number(fallback);
  return Math.round(parsed * 100) / 100;
}

function coerceOptionalDuration(value: unknown, fallback: number | null): number | null {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.round(parsed), 1440);
}

// ─── POST /brands/:brandId/services/:serviceId/assignment-request ─────────────
// Authenticated member requests a self-assignment on a brand-owned service.

export const requestAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const brandId = req.params['brandId'] as string;
    const serviceId = req.params['serviceId'] as string;
    const userId = req.user.sub;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        duration: true,
        status: true,
        brand_id: true,
      },
    });

    if (!service || service.brand_id !== brandId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if ((HIDDEN_FROM_MEMBERS as readonly string[]).includes(service.status)) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.not_assignable';
      return next(err);
    }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { owner_id: true, name: true },
    });
    const isBrandOwner = brand?.owner_id === userId;

    // Caller must be an ACCEPTED team participant of any branch under this
    // brand. Owners can also provide services, so OWNER membership is valid.
    const membership = await prisma.teamMember.findFirst({
      where: {
        user_id: userId,
        status: 'ACCEPTED',
        role: isBrandOwner ? { in: ['OWNER', 'MEMBER'] } : 'MEMBER',
        team: { branch: { brand_id: brandId } },
      },
      select: { id: true },
    });

    if (!membership) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'assignment.not_team_member';
      return next(err);
    }

    const existing = await prisma.teamMemberServiceAssignment.findUnique({
      where: {
        team_member_id_service_id: {
          team_member_id: membership.id,
          service_id: serviceId,
        },
      },
      select: assignmentSelect,
    });

    if (existing && existing.status === 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 409;
      err.messageKey = 'assignment.already_pending';
      return next(err);
    }
    if (existing && existing.status === 'ACCEPTED') {
      const err: AppError = new Error();
      err.statusCode = 409;
      err.messageKey = 'assignment.already_accepted';
      return next(err);
    }

    const nextStatus = isBrandOwner ? 'ACCEPTED' : 'PENDING';
    const nextInitiator = isBrandOwner ? 'OWNER' : 'MEMBER';
    const respondedAt = isBrandOwner ? new Date() : null;
    const requestBody = (req.body ?? {}) as Record<string, unknown>;
    const proposedDescription = coerceOptionalText(
      requestBody['proposed_description'],
      service.description ?? null,
    );
    const proposedPrice = coerceOptionalPrice(requestBody['proposed_price'], service.price);
    const proposedDuration = coerceOptionalDuration(
      requestBody['proposed_duration'],
      service.duration ?? null,
    );

    // Re-request: REJECTED / WITHDRAWN → reset; otherwise create.
    const assignment = existing
      ? await prisma.teamMemberServiceAssignment.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            initiated_by: nextInitiator,
            proposed_description: proposedDescription,
            proposed_price: proposedPrice,
            proposed_duration: proposedDuration,
            responded_at: respondedAt,
          },
          select: assignmentSelect,
        })
      : await prisma.teamMemberServiceAssignment.create({
          data: {
            team_member_id: membership.id,
            service_id: serviceId,
            status: nextStatus,
            initiated_by: nextInitiator,
            proposed_description: proposedDescription,
            proposed_price: proposedPrice,
            proposed_duration: proposedDuration,
            responded_at: respondedAt,
          },
          select: assignmentSelect,
        });

    // Notify the brand owner
    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true, last_name: true },
    });
    if (brand && requester && !isBrandOwner) {
      await prisma.notification.create({
        data: {
          user_id: brand.owner_id,
          type: 'service_assignment_requested',
          title: 'Service assignment request',
          body: `${requester.first_name} ${requester.last_name} requested to be assigned to a service in "${brand.name}".`,
          data: {
            assignment_id: assignment.id,
            service_id: serviceId,
            brand_id: brandId,
            proposed_description: proposedDescription,
            proposed_price: proposedPrice,
            proposed_duration: proposedDuration,
          },
        },
      });
    }

    sendSuccess({
      res,
      status: 201,
      message: 'assignment.requested',
      data: { assignment: mapAssignment(assignment as AssignmentRow) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /team-member-services/:assignmentId/approve ────────────────────────
// Brand owner approves a PENDING member-initiated assignment.

export const approveAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const assignmentId = req.params['assignmentId'] as string;
    const userId = req.user.sub;

    const assignment = await prisma.teamMemberServiceAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        ...assignmentSelect,
        team_member: {
          select: {
            user_id: true,
            team: { select: { branch: { select: { brand: { select: { id: true, owner_id: true, name: true } } } } } },
          },
        },
        service: { select: { id: true, title: true } },
      },
    });

    if (!assignment) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'assignment.not_found';
      return next(err);
    }

    const brandOwnerId = assignment.team_member.team.branch.brand.owner_id;
    if (brandOwnerId !== userId) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'assignment.not_brand_owner';
      return next(err);
    }

    if (assignment.status !== 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'assignment.not_pending';
      return next(err);
    }

    const updated = await prisma.teamMemberServiceAssignment.update({
      where: { id: assignmentId },
      data: { status: 'ACCEPTED', responded_at: new Date() },
      select: assignmentSelect,
    });

    await prisma.notification.create({
      data: {
        user_id: assignment.team_member.user_id,
        type: 'service_assignment_approved',
        title: 'Service assignment approved',
        body: `Your request for "${assignment.service.title}" was approved.`,
        data: {
          assignment_id: assignmentId,
          service_id: assignment.service.id,
          brand_id: assignment.team_member.team.branch.brand.id,
        },
      },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'assignment.approved',
      data: { assignment: mapAssignment(updated as AssignmentRow) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /team-member-services/:assignmentId/reject ─────────────────────────
// Brand owner rejects a PENDING member-initiated assignment.

export const rejectAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const assignmentId = req.params['assignmentId'] as string;
    const userId = req.user.sub;

    const assignment = await prisma.teamMemberServiceAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        ...assignmentSelect,
        team_member: {
          select: {
            user_id: true,
            team: { select: { branch: { select: { brand: { select: { id: true, owner_id: true } } } } } },
          },
        },
        service: { select: { id: true, title: true } },
      },
    });

    if (!assignment) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'assignment.not_found';
      return next(err);
    }

    const brandOwnerId = assignment.team_member.team.branch.brand.owner_id;
    if (brandOwnerId !== userId) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'assignment.not_brand_owner';
      return next(err);
    }

    if (assignment.status !== 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'assignment.not_pending';
      return next(err);
    }

    const updated = await prisma.teamMemberServiceAssignment.update({
      where: { id: assignmentId },
      data: { status: 'REJECTED', responded_at: new Date() },
      select: assignmentSelect,
    });

    await prisma.notification.create({
      data: {
        user_id: assignment.team_member.user_id,
        type: 'service_assignment_rejected',
        title: 'Service assignment rejected',
        body: `Your request for "${assignment.service.title}" was rejected.`,
        data: {
          assignment_id: assignmentId,
          service_id: assignment.service.id,
          brand_id: assignment.team_member.team.branch.brand.id,
        },
      },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'assignment.rejected',
      data: { assignment: mapAssignment(updated as AssignmentRow) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /team-member-services/:assignmentId ───────────────────────────────
// Withdraw / remove. Member can withdraw own PENDING or step away from ACCEPTED.
// Brand owner can remove any record (sets status WITHDRAWN to keep audit trail).

export const withdrawAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const assignmentId = req.params['assignmentId'] as string;
    const userId = req.user.sub;

    const assignment = await prisma.teamMemberServiceAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        ...assignmentSelect,
        team_member: {
          select: {
            user_id: true,
            team: { select: { branch: { select: { brand: { select: { id: true, owner_id: true } } } } } },
          },
        },
      },
    });

    if (!assignment) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'assignment.not_found';
      return next(err);
    }

    const isMember = assignment.team_member.user_id === userId;
    const isOwner = assignment.team_member.team.branch.brand.owner_id === userId;
    if (!isMember && !isOwner) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'assignment.forbidden';
      return next(err);
    }

    if (assignment.status === 'WITHDRAWN' || assignment.status === 'REJECTED') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'assignment.already_inactive';
      return next(err);
    }

    const updated = await prisma.teamMemberServiceAssignment.update({
      where: { id: assignmentId },
      data: { status: 'WITHDRAWN', responded_at: new Date() },
      select: assignmentSelect,
    });

    sendSuccess({
      res,
      status: 200,
      message: 'assignment.withdrawn',
      data: { assignment: mapAssignment(updated as AssignmentRow) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /brands/:brandId/service-assignment-requests ───────────────────────
// Pending member proposals for the brand owner, including proposed values.

export const listBrandAssignmentRequests = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const brandId = req.params['brandId'] as string;
    const userId = req.user.sub;

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { owner_id: true },
    });
    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }
    if (brand.owner_id !== userId) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'assignment.not_brand_owner';
      return next(err);
    }

    const rows = await prisma.teamMemberServiceAssignment.findMany({
      where: {
        status: 'PENDING',
        initiated_by: 'MEMBER',
        team_member: { team: { branch: { brand_id: brandId } } },
      },
      select: {
        ...assignmentSelect,
        service: {
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            price_type: true,
            duration: true,
            images: {
              select: { id: true, order: true, media: { select: { storage_path: true } } },
              orderBy: { order: 'asc' as const },
            },
          },
        },
        team_member: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                avatar_media: { select: { storage_path: true } },
              },
            },
            team: { select: { branch: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'assignment.requests',
      data: {
        requests: rows.map((r) => ({
          assignment: mapAssignment(r as AssignmentRow),
          service: {
            id: r.service.id,
            title: r.service.title,
            description: r.service.description ?? null,
            price: r.service.price ? Number(r.service.price) : null,
            price_type: r.service.price_type,
            duration: r.service.duration ?? null,
            images: r.service.images.map((img) => ({
              id: img.id,
              order: img.order,
              url: buildFileUrl(img.media.storage_path),
            })),
          },
          team_member: {
            id: r.team_member.id,
            user_id: r.team_member.user.id,
            first_name: r.team_member.user.first_name,
            last_name: r.team_member.user.last_name,
            email: r.team_member.user.email,
            avatar_url: r.team_member.user.avatar_media
              ? buildFileUrl(r.team_member.user.avatar_media.storage_path)
              : null,
          },
          branch: r.team_member.team.branch,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /services/assigned/mine ──────────────────────────────────────────────
// All ACCEPTED assignments for the calling member, with service + brand context.

export const listMyAssignedServices = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const userId = req.user.sub;

    const rows = await prisma.teamMemberServiceAssignment.findMany({
      where: {
        status: 'ACCEPTED',
        team_member: { user_id: userId, status: 'ACCEPTED' },
      },
      select: {
        ...assignmentSelect,
        service: {
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            price_type: true,
            duration: true,
            status: true,
            images: {
              select: { id: true, order: true, media: { select: { storage_path: true } } },
              orderBy: { order: 'asc' as const },
            },
            brand: {
              select: {
                id: true,
                name: true,
                logo_media: { select: { storage_path: true } },
              },
            },
          },
        },
        team_member: {
          select: {
            team: { select: { branch: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'assignment.list',
      data: {
        assignments: rows.map((r) => ({
          ...mapAssignment(r as AssignmentRow),
          service: {
            id: r.service.id,
            title: r.service.title,
            description: r.service.description ?? null,
            price: r.service.price ? Number(r.service.price) : null,
            price_type: r.service.price_type,
            duration: r.service.duration ?? null,
            status: r.service.status,
            images: r.service.images.map((img) => ({
              id: img.id,
              order: img.order,
              url: buildFileUrl(img.media.storage_path),
            })),
            brand: r.service.brand
              ? {
                  id: r.service.brand.id,
                  name: r.service.brand.name,
                  logo_url: r.service.brand.logo_media
                    ? buildFileUrl(r.service.brand.logo_media.storage_path)
                    : null,
                }
              : null,
            branch: r.team_member.team.branch,
          },
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /brands/:brandId/assignable-services ─────────────────────────────────
// Brand-owned services visible to a team member for self-assignment.
// Each row carries the caller's current assignment record (if any).

export const listAssignableServices = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const brandId = req.params['brandId'] as string;
    const userId = req.user.sub;

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, owner_id: true },
    });
    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    const isBrandOwner = brand.owner_id === userId;

    // Caller must be an ACCEPTED team participant of any branch within this
    // brand. Owners can self-assign as service providers too.
    const membership = await prisma.teamMember.findFirst({
      where: {
        user_id: userId,
        status: 'ACCEPTED',
        role: isBrandOwner ? { in: ['OWNER', 'MEMBER'] } : 'MEMBER',
        team: { branch: { brand_id: brandId } },
      },
      select: { id: true },
    });
    if (!membership) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'assignment.not_team_member';
      return next(err);
    }

    const services = await prisma.service.findMany({
      where: {
        brand_id: brandId,
        status: { notIn: HIDDEN_FROM_MEMBERS },
      },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        price_type: true,
        duration: true,
        status: true,
        brand_id: true,
        images: {
          select: { id: true, order: true, media: { select: { storage_path: true } } },
          orderBy: { order: 'asc' as const },
        },
        member_assignments: {
          select: {
            ...assignmentSelect,
            team_member: {
              select: {
                status: true,
                team: { select: { branch_id: true } },
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'service.list',
      data: {
        services: services.map((s) => {
          const acceptedAssignments = s.member_assignments.filter(
            (assignment) =>
              assignment.status === 'ACCEPTED' &&
              assignment.team_member.status === 'ACCEPTED',
          );
          const assignedBranchIds = new Set(
            acceptedAssignments.map(
              (assignment) => assignment.team_member.team.branch_id,
            ),
          );
          const myAssignment = s.member_assignments.find(
            (assignment) => assignment.team_member_id === membership.id,
          );

          return {
            id: s.id,
            title: s.title,
            description: s.description ?? null,
            price: s.price ? Number(s.price) : null,
            price_type: s.price_type,
            duration: s.duration ?? null,
            status: s.status,
            assigned_team_members_count: acceptedAssignments.length,
            assigned_branches_count: assignedBranchIds.size,
            images: s.images.map((img) => ({
              id: img.id,
              order: img.order,
              url: buildFileUrl(img.media.storage_path),
            })),
            my_assignment:
              myAssignment != null
                ? mapAssignment(myAssignment as AssignmentRow)
                : null,
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
};
