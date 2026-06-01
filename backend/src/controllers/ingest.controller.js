import { upsertProduction } from '../services/ingest.service.js';

export async function ingestProduction(req, res, next) {
  try {
    const body = req.body || {};
    const days = Array.isArray(body.days) ? body.days : (body.stat_date ? [body] : null);
    if (!days || !days.length) return res.status(400).json({ error: 'days[] or a single day object required' });
    const result = await upsertProduction(days);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
}
