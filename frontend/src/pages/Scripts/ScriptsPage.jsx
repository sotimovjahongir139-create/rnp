import { useState, useEffect, useCallback } from 'react';
import { useDashboard } from '../../context/DashboardContext.jsx';
import { usePolling }   from '../../hooks/usePolling.js';
import * as api         from '../../services/api.js';

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BADGE = {
  idle:    { lbl: 'Kutilmoqda',     cls: 'sc-badge-idle'    },
  running: { lbl: 'Ishlayapti',     cls: 'sc-badge-running' },
  success: { lbl: 'Muvaffaqiyatli', cls: 'sc-badge-success' },
  error:   { lbl: 'Xato',           cls: 'sc-badge-error'   },
};

function StatusBadge({ status }) {
  const { lbl, cls } = BADGE[status] || BADGE.idle;
  return <span className={`sc-badge ${cls}`}>{lbl}</span>;
}

function ScriptCard({ script, onRun }) {
  const [logs,      setLogs]      = useState(null);
  const [showLogs,  setShowLogs]  = useState(false);
  const [loadLogs,  setLoadLogs]  = useState(false);
  const [triggering, setTriggering] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoadLogs(true);
    try {
      const data = await api.fetchScriptLogs(script.id);
      setLogs(data);
    } catch {
      setLogs(["[Xato] Loglarni yuklab bo'lmadi"]);
    } finally {
      setLoadLogs(false);
    }
  }, [script.id]);

  const toggleLogs = () => {
    if (!showLogs) fetchLogs();
    setShowLogs((v) => !v);
  };

  const handleRun = async () => {
    setTriggering(true);
    try { await onRun(script.id); } finally { setTriggering(false); }
  };

  const busy   = script.status === 'running' || triggering;
  const canRun = script.exists && !busy;

  return (
    <div className="sc-card">
      <div className="sc-card-head">
        <div>
          <div className="sc-name">{script.name}</div>
          <div className="sc-desc">{script.description}</div>
        </div>
        <StatusBadge status={script.status} />
      </div>

      <div className="sc-meta">
        <div className="sc-meta-row">
          <span className="sc-meta-lbl">Oxirgi ishlatildi</span>
          <span className="sc-meta-val">{fmt(script.lastRun)}</span>
        </div>
        <div className="sc-meta-row">
          <span className="sc-meta-lbl">Keyingi avtomatik</span>
          <span className="sc-meta-val">{fmt(script.nextRun)}</span>
        </div>
        <div className="sc-meta-row">
          <span className="sc-meta-lbl">Fayl</span>
          <span className={`sc-meta-val ${script.exists ? 'sc-exists' : 'sc-missing'}`}>
            {script.exists ? `✓ ${script.file}` : `✗ Topilmadi: ${script.file}`}
          </span>
        </div>
        {script.exitCode !== null && (
          <div className="sc-meta-row">
            <span className="sc-meta-lbl">Oxirgi exit kodi</span>
            <span className={`sc-meta-val ${script.exitCode === 0 ? 'sc-exists' : 'sc-missing'}`}>
              {script.exitCode}
            </span>
          </div>
        )}
      </div>

      <div className="sc-actions">
        <button
          className={`sc-run-btn${canRun ? '' : ' disabled'}`}
          onClick={handleRun}
          disabled={!canRun}
        >
          {busy ? '● Ishlayapti...' : '▶ Ishlatish'}
        </button>
        <button className="sc-log-btn" onClick={toggleLogs}>
          Loglar {showLogs ? '▴' : '▾'}
        </button>
      </div>

      {showLogs && (
        <div className="sc-logs">
          {loadLogs ? (
            <div className="sc-log-loading">Yuklanmoqda...</div>
          ) : logs && logs.length > 0 ? (
            logs.map((line, i) => (
              <div key={i} className={`sc-log-line${line.startsWith('[ERR]') ? ' sc-log-err' : ''}`}>
                {line}
              </div>
            ))
          ) : (
            <div className="sc-log-empty">Hali log yo'q</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScriptsPage() {
  const { scripts, refreshScripts } = useDashboard();
  const [runningAll, setRunningAll] = useState(false);

  useEffect(() => { refreshScripts(); }, []);
  usePolling(refreshScripts, 30_000);

  const handleRun = useCallback(async (id) => {
    try {
      await api.triggerScript(id);
      setTimeout(refreshScripts, 800);
    } catch (e) {
      console.error(e);
    }
  }, [refreshScripts]);

  const handleRunAll = async () => {
    setRunningAll(true);
    try {
      await api.triggerAllScripts();
      setTimeout(refreshScripts, 800);
    } catch (e) {
      console.error(e);
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <>
      <div className="sec-head">
        <div>
          <div className="sec-title">Scriptlar — Avtomatik yangilash</div>
          <div className="sc-page-desc">Har 10 daqiqada avtomatik yangilaydi</div>
        </div>
        <button
          className={`sc-run-all-btn${runningAll ? ' disabled' : ''}`}
          onClick={handleRunAll}
          disabled={runningAll}
        >
          {runningAll ? '● Ishlamoqda...' : '▶ Barchani ishlatish'}
        </button>
      </div>

      <div className="sc-grid">
        {scripts
          ? scripts.map((s) => (
              <ScriptCard key={s.id} script={s} onRun={handleRun} />
            ))
          : <div style={{ color: 'var(--t3)', padding: '40px 0' }}>Yuklanmoqda...</div>
        }
      </div>
    </>
  );
}
