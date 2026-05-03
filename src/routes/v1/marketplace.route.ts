import { Router } from 'express';
import { getMarketplaceFacets, searchMarketplace } from '../../controllers/marketplace.controller';

const router: Router = Router();

router.get('/marketplace/facets', getMarketplaceFacets);
router.get('/marketplace/search', searchMarketplace);

export default router;
