import * as kpi from '../services/kpi.service.js';
export const getKpi = async (_req, res, next) => { try { res.json(await kpi.all()); } catch (e) { next(e); } };
