import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getKpi } from '../controllers/kpi.controller.js';
const router = Router();
router.use(requireAuth);
router.get('/', getKpi);
export default router;
