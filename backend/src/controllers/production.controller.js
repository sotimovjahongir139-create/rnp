import * as prod from '../services/production.service.js';
const wrap = (fn) => async (_req, res, next) => { try { res.json(await fn()); } catch (e) { next(e); } };
export const getKpi         = wrap(prod.kpi);
export const getDepartments = wrap(prod.departments);
export const getWeekly      = wrap(prod.weekly);
export const getCycle       = wrap(prod.cycle);
export const getTendency    = wrap(prod.tendency);
export const getSku         = wrap(prod.sku);
