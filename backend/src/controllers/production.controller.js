import * as prodService from '../services/production.service.js';

export const getKPI         = wrap(prodService.getKPI);
export const getDepartments = wrap(prodService.getDepartments);
export const getWeekly      = wrap(prodService.getWeekly);
export const getCycle       = wrap(prodService.getCycle);
export const getTendency    = wrap(prodService.getTendency);
export const getSKU         = wrap(prodService.getSKU);

function wrap(fn) {
  return async (req, res, next) => {
    try { res.json(await fn(req.query)); }
    catch (e) { next(e); }
  };
}
