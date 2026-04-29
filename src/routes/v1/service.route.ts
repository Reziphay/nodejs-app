import { Router } from 'express';
import multer from 'multer';
import {
  uploadServiceMedia,
  createService,
  getMyServices,
  listPublicServices,
  listServiceCategories,
  getServiceById,
  updateService,
  deleteService,
  submitService,
  pauseService,
  resumeService,
  archiveService,
} from '../../controllers/service.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AppError } from '../../middlewares/error.middleware';
import {
  createServiceSchema,
  updateServiceSchema,
} from '../../schemas/service.schema';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err: AppError = new Error();
      err.statusCode = 415;
      err.messageKey = 'media.invalid_file_type';
      cb(err as unknown as null, false);
    }
  },
});

const router: Router = Router();

// ─── Service media upload ──────────────────────────────────────────────────────

router.post('/services/media', authenticate, upload.single('file'), uploadServiceMedia);

// ─── Public listing ────────────────────────────────────────────────────────────

router.get('/service-categories', listServiceCategories);
router.get('/services', listPublicServices);

// ─── Authenticated routes ──────────────────────────────────────────────────────

router.get('/services/mine', authenticate, getMyServices);
router.post('/services', authenticate, validate(createServiceSchema), createService);
router.get('/services/:id', authenticate, getServiceById);
router.patch('/services/:id', authenticate, validate(updateServiceSchema), updateService);
router.delete('/services/:id', authenticate, deleteService);

// ─── Lifecycle transitions ────────────────────────────────────────────────────

router.post('/services/:id/submit', authenticate, submitService);
router.post('/services/:id/pause', authenticate, pauseService);
router.post('/services/:id/resume', authenticate, resumeService);
router.post('/services/:id/archive', authenticate, archiveService);

export default router;
