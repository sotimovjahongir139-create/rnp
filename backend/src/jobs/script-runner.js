import { spawn }        from 'child_process';
import path              from 'path';
import fs                from 'fs';
import { fileURLToPath } from 'url';
import { logger }        from '../middleware/logger.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../../../automation/scripts');
const INTERVAL_MS = 10 * 60 * 1000;
const LOG_LIMIT   = 500;
const PYTHON      = process.platform === 'win32' ? 'python' : 'python3';

export { SCRIPTS_DIR };

export const REGISTRY = {
  'amo-call': {
    id:          'amo-call',
    name:        'AmoCRM Qongiroqlar',
    file:        'amocrm_april_report.py',
    description: 'Kunlik va oylik qongiroq statistikasini yangilaydi',
  },
  'telegram': {
    id:          'telegram',
    name:        'Telegram Xabarlar',
    file:        'amocrm_telegram_response.py',
    description: 'Telegram muloqot va javob tezligini yangilaydi',
  },
};

const _state = new Map();
for (const id of Object.keys(REGISTRY)) {
  _state.set(id, {
    status:   'idle',
    lastRun:  null,
    nextRun:  null,
    exitCode: null,
    logs:     [],
    pid:      null,
  });
}

function _push(id, line) {
  const s = _state.get(id);
  if (!s) return;
  s.logs.push(line);
  if (s.logs.length > LOG_LIMIT) s.logs.shift();
}

export function getStatus() {
  return Object.values(REGISTRY).map((cfg) => {
    const s  = _state.get(cfg.id);
    const fp = path.join(SCRIPTS_DIR, cfg.file);
    return {
      id:          cfg.id,
      name:        cfg.name,
      description: cfg.description,
      file:        cfg.file,
      exists:      fs.existsSync(fp),
      status:      s.status,
      lastRun:     s.lastRun,
      nextRun:     s.nextRun,
      exitCode:    s.exitCode,
      pid:         s.pid,
    };
  });
}

export function getScriptLogs(id) {
  const s = _state.get(id);
  return s ? s.logs.slice(-200) : null;
}

export function runScript(id) {
  const cfg = REGISTRY[id];
  if (!cfg) return { ok: false, error: 'Script topilmadi' };

  const s = _state.get(id);
  if (s.status === 'running') return { ok: false, error: 'Allaqachon ishlamoqda' };

  const fp = path.join(SCRIPTS_DIR, cfg.file);
  if (!fs.existsSync(fp)) return { ok: false, error: `Fayl topilmadi: ${cfg.file}` };

  const now  = new Date();
  s.status   = 'running';
  s.lastRun  = now.toISOString();
  s.nextRun  = new Date(now.getTime() + INTERVAL_MS).toISOString();
  s.exitCode = null;
  _push(id, `[${now.toISOString()}] >>> Boshlandi: ${cfg.file}`);

  const proc = spawn(PYTHON, [fp], { cwd: SCRIPTS_DIR, env: { ...process.env } });
  s.pid = proc.pid;

  proc.stdout.on('data', (chunk) => {
    chunk.toString().split('\n').filter(Boolean).forEach((l) => _push(id, l));
  });
  proc.stderr.on('data', (chunk) => {
    chunk.toString().split('\n').filter(Boolean).forEach((l) => _push(id, '[ERR] ' + l));
  });
  proc.on('close', (code) => {
    s.pid      = null;
    s.exitCode = code;
    s.status   = code === 0 ? 'success' : 'error';
    _push(id, `[${new Date().toISOString()}] <<< Tugadi: exit=${code}`);
    logger.info(`[ScriptRunner] ${id} completed exit=${code}`);
  });
  proc.on('error', (err) => {
    s.pid      = null;
    s.status   = 'error';
    s.exitCode = -1;
    _push(id, `[ERR] Jarayon xatosi: ${err.message}`);
    logger.error(`[ScriptRunner] ${id} spawn error: ${err.message}`);
  });

  logger.info(`[ScriptRunner] ${id} started pid=${proc.pid}`);
  return { ok: true, pid: proc.pid };
}

export function runAllScripts() {
  return Object.keys(REGISTRY).map((id) => ({
    id,
    result: runScript(id),
  }));
}

export function startScheduler() {
  for (const id of Object.keys(REGISTRY)) {
    _state.get(id).nextRun = new Date(Date.now() + INTERVAL_MS).toISOString();
  }

  setInterval(() => {
    logger.info('[ScriptRunner] Scheduler tick — running all scripts');
    for (const id of Object.keys(REGISTRY)) {
      _state.get(id).nextRun = new Date(Date.now() + INTERVAL_MS).toISOString();
      runScript(id);
    }
  }, INTERVAL_MS);

  logger.info('[ScriptRunner] Scheduler started — interval: 10 min');
}
