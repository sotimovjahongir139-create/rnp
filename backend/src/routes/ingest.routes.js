import { Router } from 'express';
import { requireIngestSecret } from '../middleware/ingest.middleware.js';
import { ingestProduction } from '../controllers/ingest.controller.js';
const router = Router();
router.post('/production', requireIngestSecret, ingestProduction);
export default router;
