import * as kpiService from '../services/kpi.service.js';

export const getAll        = wrap(kpiService.getAllKPI);
export const getDaily      = wrap(kpiService.getDailyKPI);
export const getMonthly    = wrap(kpiService.getMonthlyKPI);
export const getDepartment = wrap(kpiService.getDepartmentKPI);

function wrap(fn) {
  return async (req, res, next) => {
    try { res.json(await fn(req.query)); }
    catch (e) { next(e); }
  };
}
