import { Router } from 'express';
import healthRoute from './health.route';
import authRoute from './auth.route';
import userRoute from './user.route';
import mediaRoute from './media.route';

const router: Router = Router();

router.use('/health', healthRoute);
router.use('/auth', authRoute);
router.use('/users', userRoute);
router.use('/users', mediaRoute);

export default router;
