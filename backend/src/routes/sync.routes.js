import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { ROLES } from '../config/constants.js';
import { syncCRM } from '../jobs/sync-crm.job.js';
import { syncProduction } from '../jobs/sync-production.job.js';
import { calculateDailyKPI, calculateMonthlyKPI, calculateDepartmentKPIs } from '../jobs/calculate-kpi.job.js';
import { logger } from '../middleware/logger.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN));

router.post('/', async (req, res, next) => {
  const { job = 'all' } = req.body;
  logger.info(`[Sync] Manual trigger: job=${job} by user=${req.user?.username}`);

  try {
    const results = [];

    if (job === 'all' || job === 'production') {
      results.push(await syncProduction());
    }
    if (job === 'all' || job === 'crm') {
      results.push(await syncCRM());
    }
    if (job === 'all' || job === 'kpi') {
      const daily = await calculateDailyKPI();
      await calculateMonthlyKPI();
      await calculateDepartmentKPIs();
      results.push({ job: 'kpi', status: 'ok', ...daily });
    }

    res.json({ status: 'ok', results });
  } catch (e) {
    next(e);
  }
});

export default router;
