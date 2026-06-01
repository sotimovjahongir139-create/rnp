import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getSummary, getDailyReport, getMonthlyReport } from '../controllers/analytics.controller.js';

const router = Router();
router.use(authenticate);

router.get('/summary',        getSummary);
router.get('/report/daily',   getDailyReport);
router.get('/report/monthly', getMonthlyReport);

export default router;
