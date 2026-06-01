import { Router } from 'express';
import { ping } from '../config/db.js';

const router = Router();
router.get('/health', async (_req, res) => {
  const up = await ping();
  res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', db: up ? 'up' : 'down', time: new Date().toISOString() });
});
export default router;
