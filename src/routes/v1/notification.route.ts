import { Router } from 'express';
import {
  listNotifications,
  markNotificationRead,
  getFeed,
  dismissFeedItem,
  clearFeed,
} from '../../controllers/notification.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router: Router = Router();

// ─── Feed endpoints (must come before /:id routes) ───────────────────────────

/**
 * @openapi
 * /notifications/feed:
 *   get:
 *     summary: Get unified notification feed
 *     description: >
 *       Returns a merged feed of: Notification rows, pending team invitations,
 *       incoming brand transfer requests, and outgoing pending transfers.
 *       Items hidden by cleared_before watermark or individual dismissal are excluded.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feed returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       feed_id:
 *                         type: string
 *                         example: "team_invitation:clx123"
 *                       type:
 *                         type: string
 *                         enum: [notification, team_invitation, incoming_transfer, outgoing_transfer]
 *                       source_id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       body:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       data:
 *                         type: object
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total_count:
 *                       type: integer
 *                     unread_count:
 *                       type: integer
 */
router.get('/feed', authenticate, getFeed);

/**
 * @openapi
 * /notifications/feed/clear:
 *   post:
 *     summary: Clear all feed items
 *     description: >
 *       Sets a cleared_before watermark to now(). All items created before this
 *       timestamp will be hidden from the feed. Future items remain visible.
 *       This is a visibility-only operation — no business records are deleted.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feed cleared successfully
 */
router.post('/feed/clear', authenticate, clearFeed);

/**
 * @openapi
 * /notifications/feed/items/{sourceType}/{sourceId}:
 *   delete:
 *     summary: Dismiss a single feed item
 *     description: >
 *       Marks a specific feed item as dismissed for the authenticated user.
 *       Visibility-only: does NOT reject invitations, cancel transfers, or delete
 *       notifications. Calling this endpoint twice is idempotent.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sourceType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [notification, team_invitation, incoming_transfer, outgoing_transfer]
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item dismissed successfully
 *       400:
 *         description: Invalid source type
 */
router.delete('/feed/items/:sourceType/:sourceId', authenticate, dismissFeedItem);

// ─── Legacy notification endpoints ───────────────────────────────────────────

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: List notifications (legacy)
 *     description: Returns the 50 most-recent raw Notification rows for the user.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications returned
 */
router.get('/', authenticate, listNotifications);

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/read', authenticate, markNotificationRead);

export default router;
