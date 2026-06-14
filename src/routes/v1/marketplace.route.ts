import { Router } from 'express';
import { getMarketplaceFacets, getMarketplaceHome, searchMarketplace } from '../../controllers/marketplace.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router: Router = Router();

router.get('/marketplace/facets', getMarketplaceFacets);
router.get('/marketplace/home', authenticate, getMarketplaceHome);
router.get('/marketplace/search', searchMarketplace);

export default router;
