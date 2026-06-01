import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getKPI, getDepartments, getWeekly, getCycle, getTendency, getSKU,
} from '../controllers/production.controller.js';

const router = Router();
router.use(authenticate);

router.get('/kpi',         getKPI);
router.get('/departments', getDepartments);
router.get('/weekly',      getWeekly);
router.get('/cycle',       getCycle);
router.get('/tendency',    getTendency);
router.get('/sku',         getSKU);

export default router;
