import * as kpiService from '../services/kpi.service.js';

export const getDailyKPI   = async (_req, res, next) => {
  try { res.json(await kpiService.getDailyKPI()); } catch (e) { next(e); }
};
export const getMonthlyKPI = async (_req, res, next) => {
  try { res.json(await kpiService.getMonthlyKPI()); } catch (e) { next(e); }
};
