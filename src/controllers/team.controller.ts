import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { buildFileUrl } from '../services/storage.service';
import type { InviteToTeamInput } from '../schemas/team.schema';

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

// ─── Response mappers ─────────────────────────────────────────────────────────

function mapMember(m: {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  invited_by_user_id: string;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_media: { storage_path: string } | null;
  };
}) {
  return {
    membership_id: m.id,
    user_id: m.user_id,
    first_name: m.user.first_name,
    last_name: m.user.last_name,
    email: m.user.email,
    avatar_url: m.user.avatar_media ? buildFileUrl(m.user.avatar_media.storage_path) : null,
    role: m.role,
    status: m.status,
    invited_by_user_id: m.invited_by_user_id,
    invited_at: m.created_at.toISOString(),
    updated_at: m.updated_at.toISOString(),
  };
}

const teamMemberSelect = {
  id: true,
  user_id: true,
  invited_by_user_id: true,
  role: true,
  status: true,
  created_at: true,
  updated_at: true,
  user: {
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      avatar_media: { select: { storage_path: true } },
    },
  },
} as const;

// ─── GET /brands/:id/team-workspace ──────────────────────────────────────────
// Returns brand summary + all branches with their team state. Brand owners and
// accepted brand team members can read it; mutations remain owner-only.

export const getTeamWorkspace = async (
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
      select: {
        id: true,
        name: true,
        status: true,
        owner_id: true,
        logo_media: { select: { storage_path: true } },
        branches: {
          select: {
            id: true,
            name: true,
            address1: true,
            address2: true,
            is_24_7: true,
            opening: true,
            closing: true,
            cover_media_id: true,
            cover_media: { select: { storage_path: true } },
            created_at: true,
            team: {
              select: {
                id: true,
                created_at: true,
                members: { select: teamMemberSelect },
              },
            },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    const canView =
      brand.owner_id === userId ||
      brand.branches.some((branch) =>
        (branch.team?.members ?? []).some(
          (member) => member.user_id === userId && member.status === 'ACCEPTED',
        ),
      );

    if (!canView) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'brand.not_owner';
      return next(err);
    }

    const workspace = {
      brand_id: brand.id,
      brand_name: brand.name,
      brand_status: brand.status,
      brand_logo_url: brand.logo_media ? buildFileUrl(brand.logo_media.storage_path) : null,
      branches: brand.branches.map((branch) => {
        const members = branch.team?.members ?? [];
        return {
          branch_id: branch.id,
          branch_name: branch.name,
          cover_media_id: branch.cover_media_id ?? null,
          cover_url: branch.cover_media ? buildFileUrl(branch.cover_media.storage_path) : null,
          address: {
            address1: branch.address1,
            address2: branch.address2 ?? null,
          },
          availability: branch.is_24_7
            ? { is_24_7: true, opening: null, closing: null }
            : { is_24_7: false, opening: branch.opening ?? null, closing: branch.closing ?? null },
          team_id: branch.team?.id ?? null,
          team_created_at: branch.team?.created_at.toISOString() ?? null,
          members: {
            accepted: members.filter((m) => m.status === 'ACCEPTED').map(mapMember),
            pending: members.filter((m) => m.status === 'PENDING').map(mapMember),
            rejected: members.filter((m) => m.status === 'REJECTED').map(mapMember),
            removed: members.filter((m) => m.status === 'REMOVED').map(mapMember),
          },
        };
      }),
    };

    sendSuccess({ res, status: 200, message: 'team.workspace', data: { workspace } });
  } catch (err) {
    next(err);
  }
};

// ─── GET /brands/:id/branches/:branchId/team ─────────────────────────────────
// Returns one branch's team in detail. Brand owners and accepted brand team
// members can read it; mutations remain owner-only.

export const getBranchTeam = async (
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
      select: { owner_id: true },
    });

    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    const canView =
      brand.owner_id === userId ||
      Boolean(
        await prisma.teamMember.findFirst({
          where: {
            user_id: userId,
            status: 'ACCEPTED',
            team: { branch: { brand_id: brandId } },
          },
          select: { id: true },
        }),
      );

    if (!canView) {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'brand.not_owner';
      return next(err);
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        brand_id: true,
        name: true,
        address1: true,
        address2: true,
        is_24_7: true,
        opening: true,
        closing: true,
        cover_media_id: true,
        cover_media: { select: { storage_path: true } },
        team: {
          select: {
            id: true,
            created_at: true,
            members: { select: teamMemberSelect },
          },
        },
      },
    });

    if (!branch || branch.brand_id !== brandId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'branch.not_found';
      return next(err);
    }

    const members = branch.team?.members ?? [];

    sendSuccess({
      res,
      status: 200,
      message: 'team.found',
      data: {
        team: {
          team_id: branch.team?.id ?? null,
          branch_id: branch.id,
          branch_name: branch.name,
          cover_media_id: branch.cover_media_id ?? null,
          cover_url: branch.cover_media ? buildFileUrl(branch.cover_media.storage_path) : null,
          address: { address1: branch.address1, address2: branch.address2 ?? null },
          availability: branch.is_24_7
            ? { is_24_7: true, opening: null, closing: null }
            : { is_24_7: false, opening: branch.opening ?? null, closing: branch.closing ?? null },
          members: {
            accepted: members.filter((m) => m.status === 'ACCEPTED').map(mapMember),
            pending: members.filter((m) => m.status === 'PENDING').map(mapMember),
            rejected: members.filter((m) => m.status === 'REJECTED').map(mapMember),
            removed: members.filter((m) => m.status === 'REMOVED').map(mapMember),
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /brands/:id/branches/:branchId/team/invitations ─────────────────────
// Invite a USO user into this branch team. Owner only.

export const inviteToTeam = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const brandId = req.params['id'] as string;
    const branchId = req.params['branchId'] as string;
    const userId = req.user.sub;
    const body = req.body as InviteToTeamInput;

    // Cannot invite yourself
    if (body.target_user_id === userId) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'team.invite_self';
      return next(err);
    }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { owner_id: true, name: true },
    });

    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    if (!requireOwner(brand.owner_id, userId, next)) return;

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        brand_id: true,
        name: true,
        team: { select: { id: true } },
      },
    });

    if (!branch || branch.brand_id !== brandId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'branch.not_found';
      return next(err);
    }

    if (!branch.team) {
      // Should never happen after migration, but guard defensively
      const err: AppError = new Error();
      err.statusCode = 500;
      err.messageKey = 'team.not_found';
      return next(err);
    }

    // Target must be a USO user
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
      err.messageKey = 'team.invite_non_uso';
      return next(err);
    }

    const teamId = branch.team.id;

    // Check existing membership for this (team, user) pair
    const existing = await prisma.teamMember.findUnique({
      where: { team_id_user_id: { team_id: teamId, user_id: body.target_user_id } },
      select: { id: true, status: true, role: true },
    });

    if (existing) {
      if (existing.status === 'PENDING') {
        const err: AppError = new Error();
        err.statusCode = 409;
        err.messageKey = 'team.invite_already_pending';
        return next(err);
      }

      if (existing.status === 'ACCEPTED') {
        const err: AppError = new Error();
        err.statusCode = 409;
        err.messageKey = 'team.invite_already_member';
        return next(err);
      }

      // REJECTED or REMOVED → re-invite by resetting the existing record
      const updated = await prisma.teamMember.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          invited_by_user_id: userId,
        },
        select: teamMemberSelect,
      });

      await prisma.notification.create({
        data: {
          user_id: body.target_user_id,
          type: 'team_invite_request',
          title: 'Team invitation',
          body: `You have been invited to join the team for "${branch.name}" (${brand.name}).`,
          data: {
            membership_id: updated.id,
            team_id: teamId,
            branch_id: branchId,
            brand_id: brandId,
          },
        },
      });

      sendSuccess({
        res,
        status: 201,
        message: 'team.invite_sent',
        data: { membership: mapMember(updated) },
      });
      return;
    }

    // No existing record — create a fresh invitation
    const membership = await prisma.teamMember.create({
      data: {
        team_id: teamId,
        user_id: body.target_user_id,
        invited_by_user_id: userId,
        role: 'MEMBER',
        status: 'PENDING',
      },
      select: teamMemberSelect,
    });

    await prisma.notification.create({
      data: {
        user_id: body.target_user_id,
        type: 'team_invite_request',
        title: 'Team invitation',
        body: `You have been invited to join the team for "${branch.name}" (${brand.name}).`,
        data: {
          membership_id: membership.id,
          team_id: teamId,
          branch_id: branchId,
          brand_id: brandId,
        },
      },
    });

    sendSuccess({
      res,
      status: 201,
      message: 'team.invite_sent',
      data: { membership: mapMember(membership) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /team-members/:teamMemberId/accept ─────────────────────────────────
// Accept a pending invitation. Invited user only.

export const acceptInvitation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const teamMemberId = req.params['teamMemberId'] as string;
    const userId = req.user.sub;

    const membership = await prisma.teamMember.findUnique({
      where: { id: teamMemberId },
      select: {
        id: true,
        user_id: true,
        invited_by_user_id: true,
        status: true,
        role: true,
        team: {
          select: {
            id: true,
            branch: {
              select: {
                id: true,
                name: true,
                brand: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!membership || membership.user_id !== userId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'team.membership_not_found';
      return next(err);
    }

    if (membership.status !== 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'team.invite_not_pending';
      return next(err);
    }

    const updated = await prisma.teamMember.update({
      where: { id: teamMemberId },
      data: { status: 'ACCEPTED' },
      select: teamMemberSelect,
    });

    // Notify the inviter
    await prisma.notification.create({
      data: {
        user_id: membership.invited_by_user_id,
        type: 'team_invite_accepted',
        title: 'Team invitation accepted',
        body: `Your invitation for "${membership.team.branch.name}" (${membership.team.branch.brand.name}) was accepted.`,
        data: {
          membership_id: teamMemberId,
          team_id: membership.team.id,
          branch_id: membership.team.branch.id,
          brand_id: membership.team.branch.brand.id,
        },
      },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'team.invite_accepted',
      data: { membership: mapMember(updated) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /team-members/:teamMemberId/reject ─────────────────────────────────
// Reject a pending invitation. Invited user only.

export const rejectInvitation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const teamMemberId = req.params['teamMemberId'] as string;
    const userId = req.user.sub;

    const membership = await prisma.teamMember.findUnique({
      where: { id: teamMemberId },
      select: {
        id: true,
        user_id: true,
        invited_by_user_id: true,
        status: true,
        team: {
          select: {
            id: true,
            branch: {
              select: {
                id: true,
                name: true,
                brand: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!membership || membership.user_id !== userId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'team.membership_not_found';
      return next(err);
    }

    if (membership.status !== 'PENDING') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'team.invite_not_pending';
      return next(err);
    }

    const updated = await prisma.teamMember.update({
      where: { id: teamMemberId },
      data: { status: 'REJECTED' },
      select: teamMemberSelect,
    });

    // Notify the inviter
    await prisma.notification.create({
      data: {
        user_id: membership.invited_by_user_id,
        type: 'team_invite_rejected',
        title: 'Team invitation rejected',
        body: `Your invitation for "${membership.team.branch.name}" (${membership.team.branch.brand.name}) was rejected.`,
        data: {
          membership_id: teamMemberId,
          team_id: membership.team.id,
          branch_id: membership.team.branch.id,
          brand_id: membership.team.branch.brand.id,
        },
      },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'team.invite_rejected',
      data: { membership: mapMember(updated) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /brands/:id/branches/:branchId/team/members/:teamMemberId/remove ───
// Remove an accepted member from the team. Owner only.
// The OWNER membership (role = OWNER) is protected and cannot be removed.

export const removeMember = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const brandId = req.params['id'] as string;
    const branchId = req.params['branchId'] as string;
    const teamMemberId = req.params['teamMemberId'] as string;
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

    if (!requireOwner(brand.owner_id, userId, next)) return;

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, brand_id: true, team: { select: { id: true } } },
    });

    if (!branch || branch.brand_id !== brandId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'branch.not_found';
      return next(err);
    }

    if (!branch.team) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'team.not_found';
      return next(err);
    }

    const membership = await prisma.teamMember.findUnique({
      where: { id: teamMemberId },
      select: { id: true, team_id: true, role: true, status: true },
    });

    if (!membership || membership.team_id !== branch.team.id) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'team.membership_not_found';
      return next(err);
    }

    // Protect the OWNER membership — it is tied to the brand owner and must not
    // be removed through normal endpoints. Ownership changes via brand transfer.
    if (membership.role === 'OWNER') {
      const err: AppError = new Error();
      err.statusCode = 403;
      err.messageKey = 'team.cannot_remove_owner';
      return next(err);
    }

    if (membership.status === 'REMOVED') {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'team.already_removed';
      return next(err);
    }

    const updated = await prisma.teamMember.update({
      where: { id: teamMemberId },
      data: { status: 'REMOVED' },
      select: teamMemberSelect,
    });

    sendSuccess({
      res,
      status: 200,
      message: 'team.member_removed',
      data: { membership: mapMember(updated) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /team-members/my-invitations ─────────────────────────────────────────
// List all pending invitations for the authenticated USO user.

export const getMyInvitations = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireUso(req, next)) return;

    const userId = req.user.sub;

    const memberships = await prisma.teamMember.findMany({
      where: { user_id: userId, status: 'PENDING' },
      select: {
        id: true,
        user_id: true,
        invited_by_user_id: true,
        role: true,
        status: true,
        created_at: true,
        updated_at: true,
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            avatar_media: { select: { storage_path: true } },
          },
        },
        team: {
          select: {
            id: true,
            branch: {
              select: {
                id: true,
                name: true,
                brand: {
                  select: {
                    id: true,
                    name: true,
                    logo_media: { select: { storage_path: true } },
                  },
                },
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
      message: 'team.invitations_list',
      data: {
        invitations: memberships.map((m) => ({
          membership_id: m.id,
          status: m.status,
          role: m.role,
          invited_at: m.created_at.toISOString(),
          team_id: m.team.id,
          branch: {
            id: m.team.branch.id,
            name: m.team.branch.name,
          },
          brand: {
            id: m.team.branch.brand.id,
            name: m.team.branch.brand.name,
            logo_url: m.team.branch.brand.logo_media
              ? buildFileUrl(m.team.branch.brand.logo_media.storage_path)
              : null,
          },
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};
