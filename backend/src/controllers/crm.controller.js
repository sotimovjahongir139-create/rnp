import * as crm from '../services/crm.service.js';
const wrap = (fn) => async (_req, res, next) => { try { res.json(await fn()); } catch (e) { next(e); } };
export const getMonthly      = wrap(crm.monthly);
export const getDaily        = wrap(crm.daily);
export const getHourly       = wrap(crm.hourly);
export const getHourlyToday  = wrap(crm.hourlyToday);
export const getTelegramKpi  = wrap(crm.telegramKpi);
export const getTelegramCats = wrap(crm.telegramCategories);
