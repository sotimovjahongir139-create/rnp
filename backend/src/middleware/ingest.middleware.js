import { loadEnv } from '../config/env.js';

export function requireIngestSecret(req, res, next) {
  const env = loadEnv();
  if (!env.ingestSecret) return res.status(503).json({ error: 'ingest disabled (no INGEST_SECRET)' });
  if (req.headers['x-ingest-secret'] !== env.ingestSecret) return res.status(401).json({ error: 'bad ingest secret' });
  next();
}
