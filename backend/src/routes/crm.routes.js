import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getMonthly, getDaily, getHourly, getHourlyToday,
  getTelegramKPI, getCategories,
} from '../controllers/crm.controller.js';

const router = Router();
router.use(authenticate);

router.get('/monthly',             getMonthly);
router.get('/daily',               getDaily);
router.get('/hourly',              getHourly);
router.get('/hourly-today',        getHourlyToday);
router.get('/telegram/kpi',        getTelegramKPI);
router.get('/telegram/categories', getCategories);

export default router;
