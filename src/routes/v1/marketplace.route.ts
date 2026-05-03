import { Router } from 'express';
import { getMarketplaceFacets } from '../../controllers/marketplace.controller';

const router: Router = Router();

router.get('/marketplace/facets', getMarketplaceFacets);

export default router;
