import {
  DEPT, PRODUCTION_KPI, WEEKLY, CYCLE, TENDENCY, SKU,
  CRM_OYLIK, CRM_KUNLIK, HOURLY, HOURLY_K,
  TELEGRAM_KPI, CATS,
  QC_KPI, QC_TREND, QC_TOP_MODELS, QC_SABABLARI, QC_TOP10,
} from '../data/mockData.js';

const MOCK_SCRIPTS = [
  {
    id: 'amo-call', name: 'AmoCRM Qongiroqlar',
    description: 'Kunlik va oylik qongiroq statistikasini yangilaydi',
    file: 'amocrm_april_report.py',
    exists: false, status: 'idle',
    lastRun: null, nextRun: null, exitCode: null, pid: null,
  },
  {
    id: 'telegram', name: 'Telegram Xabarlar',
    description: 'Telegram muloqot va javob tezligini yangilaydi',
    file: 'amocrm_telegram_response.py',
    exists: false, status: 'idle',
    lastRun: null, nextRun: null, exitCode: null, pid: null,
  },
];

const USE_MOCK = true;
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function get(path) {
  const token = localStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

// ─── Auth ──────────────────────────────────────────────────────
export async function login(username, password) {
  if (USE_MOCK) return { token: 'mock-token', user: { username, role: 'admin' } };
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json();
}

// ─── Production ───────────────────────────────────────────────
export async function fetchProductionKPI() {
  if (USE_MOCK) return PRODUCTION_KPI;
  return get('/api/production/kpi');
}

export async function fetchDepartments() {
  if (USE_MOCK) return DEPT;
  return get('/api/production/departments');
}

export async function fetchWeekly() {
  if (USE_MOCK) return WEEKLY;
  return get('/api/production/weekly');
}

export async function fetchCycle() {
  if (USE_MOCK) return CYCLE;
  return get('/api/production/cycle');
}

export async function fetchTendency() {
  if (USE_MOCK) return TENDENCY;
  return get('/api/production/tendency');
}

export async function fetchSKU() {
  if (USE_MOCK) return SKU;
  return get('/api/production/sku');
}

// ─── CRM ──────────────────────────────────────────────────────
export async function fetchCRMOylik() {
  if (USE_MOCK) return CRM_OYLIK;
  return get('/api/crm/monthly');
}

export async function fetchCRMKunlik() {
  if (USE_MOCK) return CRM_KUNLIK;
  return get('/api/crm/daily');
}

export async function fetchHourly() {
  if (USE_MOCK) return HOURLY;
  return get('/api/crm/hourly');
}

export async function fetchHourlyK() {
  if (USE_MOCK) return HOURLY_K;
  return get('/api/crm/hourly-today');
}

// ─── Telegram ─────────────────────────────────────────────────
export async function fetchTelegramKPI() {
  if (USE_MOCK) return TELEGRAM_KPI;
  return get('/api/crm/telegram/kpi');
}

export async function fetchCategories() {
  if (USE_MOCK) return CATS;
  return get('/api/crm/telegram/categories');
}

// ─── QC ───────────────────────────────────────────────────────
export async function fetchQCKpi()         { if (USE_MOCK) return QC_KPI;        return get('/api/qc/kpi'); }
export async function fetchQCTrend()        { if (USE_MOCK) return QC_TREND;      return get('/api/qc/trend'); }
export async function fetchQCTopModels()    { if (USE_MOCK) return QC_TOP_MODELS; return get('/api/qc/top-models'); }
export async function fetchQCSabablari()    { if (USE_MOCK) return QC_SABABLARI;  return get('/api/qc/sabablari'); }
export async function fetchQCTop10()        { if (USE_MOCK) return QC_TOP10;      return get('/api/qc/top10'); }

// ─── KPI ──────────────────────────────────────────────────────
export async function fetchKPI() {
  if (USE_MOCK) return {};
  return get('/api/kpi');
}

// ─── Manual sync trigger ───────────────────────────────────────
export async function triggerSync(job = 'all') {
  if (USE_MOCK) return { ok: true };
  const res = await fetch(`${BASE}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: JSON.stringify({ job }),
  });
  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  return res.json();
}

// ─── Scripts ──────────────────────────────────────────────────
export async function fetchScripts() {
  if (USE_MOCK) return MOCK_SCRIPTS;
  return get('/api/scripts');
}

export async function fetchScriptLogs(id) {
  if (USE_MOCK) return [];
  return get(`/api/scripts/${id}/logs`);
}

export async function triggerScript(id) {
  if (USE_MOCK) return { ok: true };
  const res = await fetch(`${BASE}/api/scripts/${id}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (!res.ok) throw new Error(`Script trigger failed: ${res.status}`);
  return res.json();
}

export async function triggerAllScripts() {
  if (USE_MOCK) return { ok: true };
  const res = await fetch(`${BASE}/api/scripts/all/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (!res.ok) throw new Error(`Scripts trigger failed: ${res.status}`);
  return res.json();
}
