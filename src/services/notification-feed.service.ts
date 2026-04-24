/**
 * Notification Feed Service
 *
 * Builds a unified, server-side-filtered feed that mixes:
 *   1. Notification rows (type = 'notification')
 *   2. Pending TeamMember invitations (type = 'team_invitation')
 *   3. Incoming pending BrandTransfers (type = 'incoming_transfer')
 *   4. Outgoing pending BrandTransfers (type = 'outgoing_transfer')
 *
 * Visibility rules (applied in this order):
 *   a. Items whose date is older than the user's cleared_before watermark are hidden.
 *   b. Items individually dismissed via NotificationFeedDismissal are hidden.
 *
 * Dismissal / clearing are purely presentation-layer operations — they never
 * reject an invitation, cancel a transfer, or delete a Notification row.
 */

import prisma from '../lib/prisma';
import { buildFileUrl } from './storage.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FeedItemType =
  | 'notification'
  | 'team_invitation'
  | 'incoming_transfer'
  | 'outgoing_transfer';

export interface FeedItem {
  /** Composite ID used for dismiss: "<type>:<source_id>" */
  feed_id: string;
  type: FeedItemType;
  source_id: string;
  title: string;
  body: string;
  /** ISO-8601 date string — used for sorting and cleared_before comparison */
  created_at: string;
  /** Any extra payload the client may need */
  data: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveAvatarUrl(storagePath: string | null | undefined): string | null {
  return storagePath ? buildFileUrl(storagePath) : null;
}

// ─── Feed Builder ─────────────────────────────────────────────────────────────

export async function buildFeed(userId: string): Promise<{
  items: FeedItem[];
  meta: { total_count: number; unread_count: number };
}> {
  // 1. Load user's feed state (cleared_before watermark) and dismissal set
  const [feedState, dismissals] = await Promise.all([
    prisma.notificationFeedState.findUnique({
      where: { user_id: userId },
      select: { cleared_before: true },
    }),
    prisma.notificationFeedDismissal.findMany({
      where: { user_id: userId },
      select: { source_type: true, source_id: true },
    }),
  ]);

  const clearedBefore: Date | null = feedState?.cleared_before ?? null;

  // Build a Set for O(1) dismissal lookups: "source_type:source_id"
  const dismissedSet = new Set<string>(
    dismissals.map((d) => `${d.source_type}:${d.source_id}`),
  );

  const afterClear = (date: Date): boolean =>
    clearedBefore === null || date > clearedBefore;

  const isDismissed = (type: FeedItemType, sourceId: string): boolean =>
    dismissedSet.has(`${type}:${sourceId}`);

  const isVisible = (type: FeedItemType, sourceId: string, date: Date): boolean =>
    afterClear(date) && !isDismissed(type, sourceId);

  // 2. Query all four sources concurrently
  const [notifications, teamInvitations, incomingTransfers, outgoingTransfers] =
    await Promise.all([
      // Notification rows for this user
      prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 100,
      }),

      // Pending TeamMember invitations where I am the invited user
      prisma.teamMember.findMany({
        where: {
          user_id: userId,
          status: 'PENDING',
        },
        include: {
          team: {
            include: {
              branch: {
                select: {
                  id: true,
                  name: true,
                  brand: { select: { id: true, name: true } },
                },
              },
              creator: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  avatar_media: { select: { storage_path: true } },
                },
              },
            },
          },
          invited_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              avatar_media: { select: { storage_path: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),

      // Pending BrandTransfers where I am the recipient
      prisma.brandTransfer.findMany({
        where: { to_user_id: userId, status: 'PENDING' },
        include: {
          brand: { select: { id: true, name: true } },
          from_user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              avatar_media: { select: { storage_path: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),

      // Pending BrandTransfers that I initiated (outgoing)
      prisma.brandTransfer.findMany({
        where: { from_user_id: userId, status: 'PENDING' },
        include: {
          brand: { select: { id: true, name: true } },
          to_user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              avatar_media: { select: { storage_path: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    ]);

  // 3. Map each source into FeedItems, applying visibility rules
  const items: FeedItem[] = [];

  for (const n of notifications) {
    if (!isVisible('notification', n.id, n.created_at)) continue;
    items.push({
      feed_id: `notification:${n.id}`,
      type: 'notification',
      source_id: n.id,
      title: n.title,
      body: n.body,
      created_at: n.created_at.toISOString(),
      data: {
        notification_type: n.type,
        read: n.read,
        ...(n.data as Record<string, unknown> | null ?? {}),
      },
    });
  }

  for (const tm of teamInvitations) {
    if (!isVisible('team_invitation', tm.id, tm.created_at)) continue;
    const inviter = tm.invited_by;
    const branch = tm.team.branch;
    items.push({
      feed_id: `team_invitation:${tm.id}`,
      type: 'team_invitation',
      source_id: tm.id,
      title: 'Team invitation',
      body: `${inviter.first_name} ${inviter.last_name} invited you to join the team for "${branch.name}" (${branch.brand.name}).`,
      created_at: tm.created_at.toISOString(),
      data: {
        team_member_id: tm.id,
        team_id: tm.team_id,
        branch_id: branch.id,
        branch_name: branch.name,
        brand_id: branch.brand.id,
        brand_name: branch.brand.name,
        role: tm.role,
        invited_by: {
          id: inviter.id,
          first_name: inviter.first_name,
          last_name: inviter.last_name,
          avatar_url: resolveAvatarUrl(inviter.avatar_media?.storage_path),
        },
      },
    });
  }

  for (const t of incomingTransfers) {
    if (!isVisible('incoming_transfer', t.id, t.created_at)) continue;
    const sender = t.from_user;
    items.push({
      feed_id: `incoming_transfer:${t.id}`,
      type: 'incoming_transfer',
      source_id: t.id,
      title: 'Brand transfer request',
      body: `${sender.first_name} ${sender.last_name} wants to transfer the brand "${t.brand.name}" to you.`,
      created_at: t.created_at.toISOString(),
      data: {
        transfer_id: t.id,
        brand_id: t.brand.id,
        brand_name: t.brand.name,
        from_user: {
          id: sender.id,
          first_name: sender.first_name,
          last_name: sender.last_name,
          avatar_url: resolveAvatarUrl(sender.avatar_media?.storage_path),
        },
      },
    });
  }

  for (const t of outgoingTransfers) {
    if (!isVisible('outgoing_transfer', t.id, t.created_at)) continue;
    const recipient = t.to_user;
    items.push({
      feed_id: `outgoing_transfer:${t.id}`,
      type: 'outgoing_transfer',
      source_id: t.id,
      title: 'Pending brand transfer',
      body: `Waiting for ${recipient.first_name} ${recipient.last_name} to accept the transfer of "${t.brand.name}".`,
      created_at: t.created_at.toISOString(),
      data: {
        transfer_id: t.id,
        brand_id: t.brand.id,
        brand_name: t.brand.name,
        to_user: {
          id: recipient.id,
          first_name: recipient.first_name,
          last_name: recipient.last_name,
          avatar_url: resolveAvatarUrl(recipient.avatar_media?.storage_path),
        },
      },
    });
  }

  // 4. Sort all items newest-first
  items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // 5. Compute meta counts
  //    "unread" = notification items not yet read + any non-notification items (always unread)
  const unread_count = items.filter(
    (i) => i.type !== 'notification' || i.data['read'] === false,
  ).length;

  return {
    items,
    meta: {
      total_count: items.length,
      unread_count,
    },
  };
}
