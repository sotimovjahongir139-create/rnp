import { Router }     from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getDepartmentsCtrl, getProductionKPI, getWeekly, getCycle, getTendency, getSKU,
} from '../controllers/production.controller.js';

const router = Router();
router.use(authenticate);

router.get('/departments', getDepartmentsCtrl);
router.get('/kpi',         getProductionKPI);
router.get('/weekly',      getWeekly);
router.get('/cycle',       getCycle);
router.get('/tendency',    getTendency);
router.get('/sku',         getSKU);

export default router;
