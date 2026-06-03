import * as prodService from '../services/production.service.js';

export const getDepartmentsCtrl = wrap(prodService.getDepartments);
export const getProductionKPI   = wrap(prodService.getProductionKPI);
export const getWeekly          = wrap(prodService.getWeekly);
export const getCycle           = wrap(prodService.getCycle);
export const getTendency        = wrap(prodService.getTendency);
export const getSKU             = wrap(prodService.getSKU);

function wrap(fn) {
  return async (req, res, next) => {
    try { res.json(await fn(req.query)); }
    catch (e) { next(e); }
  };
}
