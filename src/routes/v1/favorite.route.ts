import { Router } from 'express';
import {
  addFavoriteBrand,
  addFavoriteService,
  listFavorites,
  removeFavoriteBrand,
  removeFavoriteService,
} from '../../controllers/favorite.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router: Router = Router();

router.get('/favorites', authenticate, listFavorites);
router.post('/favorites/brands/:id', authenticate, addFavoriteBrand);
router.delete('/favorites/brands/:id', authenticate, removeFavoriteBrand);
router.post('/favorites/services/:id', authenticate, addFavoriteService);
router.delete('/favorites/services/:id', authenticate, removeFavoriteService);

export default router;
