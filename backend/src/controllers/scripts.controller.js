import { getStatus, getScriptLogs, runScript, runAllScripts } from '../jobs/script-runner.js';

export function listScripts(_req, res) { res.json(getStatus()); }
export function triggerScript(req, res) { res.json(runScript(req.params.id)); }
export function triggerAll(_req, res) { res.json({ ok: true, results: runAllScripts() }); }
export function scriptLogs(req, res) {
  const logs = getScriptLogs(req.params.id);
  if (logs === null) return res.status(404).json({ error: 'Script topilmadi' });
  res.json(logs);
}
