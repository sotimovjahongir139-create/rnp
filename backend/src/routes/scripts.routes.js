import { Router }     from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listScripts, triggerScript, triggerAll, scriptLogs,
} from '../controllers/scripts.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',           listScripts);
router.post('/all/run',   triggerAll);      // must be before /:id/run
router.get('/:id/logs',   scriptLogs);
router.post('/:id/run',   triggerScript);

export default router;
