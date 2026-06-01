import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getAll, getDaily, getMonthly, getDepartment } from '../controllers/kpi.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',           getAll);
router.get('/daily',      getDaily);
router.get('/monthly',    getMonthly);
router.get('/department', getDepartment);

export default router;
