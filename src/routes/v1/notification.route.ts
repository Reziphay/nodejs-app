import { Router } from 'express';
import { listNotifications, markNotificationRead } from '../../controllers/notification.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router: Router = Router();

// List all notifications for the authenticated user (newest first, max 50)
router.get('/', authenticate, listNotifications);

// Mark a specific notification as read
router.patch('/:id/read', authenticate, markNotificationRead);

export default router;
