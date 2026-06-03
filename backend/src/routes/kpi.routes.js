import { Router }     from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDailyKPI, getMonthlyKPI } from '../controllers/kpi.controller.js';

const router = Router();
router.use(authenticate);

router.get('/daily',   getDailyKPI);
router.get('/monthly', getMonthlyKPI);

export default router;
