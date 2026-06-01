import { getStatus, getScriptLogs, runScript, runAllScripts } from '../jobs/script-runner.js';

export function listScripts(_req, res) {
  res.json(getStatus());
}

export function triggerScript(req, res) {
  const result = runScript(req.params.id);
  res.json(result);
}

export function triggerAll(_req, res) {
  const results = runAllScripts();
  res.json({ ok: true, results });
}

export function scriptLogs(req, res) {
  const logs = getScriptLogs(req.params.id);
  if (logs === null) return res.status(404).json({ error: 'Script topilmadi' });
  res.json(logs);
}
