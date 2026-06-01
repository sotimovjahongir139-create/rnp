import * as qc from '../services/qc.service.js';
const wrap = (fn) => async (req, res, next) => { try { res.json(await fn()); } catch (e) { next(e); } };
export const getKpi        = wrap(qc.kpi);
export const getTopModels  = wrap(qc.topModels);
export const getSabablari  = wrap(qc.sabablari);
export const getTop10      = wrap(qc.top10);
export const getTrend      = wrap(qc.trend);
