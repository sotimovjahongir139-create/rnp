import * as analyticsService from '../services/analytics.service.js';

export const getSummary      = wrap(analyticsService.getSummary);
export const getDailyReport  = wrap(analyticsService.getDailyReport);
export const getMonthlyReport= wrap(analyticsService.getMonthlyReport);

function wrap(fn) {
  return async (req, res, next) => {
    try { res.json(await fn(req.query)); }
    catch (e) { next(e); }
  };
}
