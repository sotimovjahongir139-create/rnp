import * as crmService from '../services/crm.service.js';

export const getMonthly     = wrap(crmService.getMonthlyStats);
export const getDaily       = wrap(crmService.getDailyStats);
export const getHourly      = wrap(crmService.getHourlyDistribution);
export const getHourlyToday = wrap(crmService.getHourlyToday);
export const getTelegramKPI = wrap(crmService.getTelegramKPI);
export const getCategories  = wrap(crmService.getMessageCategories);

function wrap(fn) {
  return async (req, res, next) => {
    try { res.json(await fn(req.query)); }
    catch (e) { next(e); }
  };
}
