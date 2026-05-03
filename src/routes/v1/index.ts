import { Router } from 'express';
import healthRoute from './health.route';
import authRoute from './auth.route';
import userRoute from './user.route';
import mediaRoute from './media.route';
import brandRoute from './brand.route';
import notificationRoute from './notification.route';
import teamRoute from './team.route';
import serviceRoute from './service.route';
import moderationRoute from './moderation.route';
import marketplaceRoute from './marketplace.route';

const router: Router = Router();

router.use('/health', healthRoute);
router.use('/auth', authRoute);
router.use('/users', userRoute);
router.use('/users', mediaRoute);
router.use('/', brandRoute);
router.use('/notifications', notificationRoute);
router.use('/', teamRoute);
router.use('/', serviceRoute);
router.use('/', moderationRoute);
router.use('/', marketplaceRoute);

export default router;
