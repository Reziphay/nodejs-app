import { Router } from 'express';
import healthRoute from './health.route';
import authRoute from './auth.route';

const router: Router = Router();

router.use('/health', healthRoute);
router.use('/auth', authRoute);

export default router;
