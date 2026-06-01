import { query } from '../config/db.js';

// "Current period" KPIs use a rolling 30-day window (not the calendar month):
// on the 1st of a month the calendar-month figure is ~0 (data lands later), which
// reads as a broken dashboard. 30 days mirrors the production department window and
// always reflects recent activity. All date math is done in SQL (DB-local CURRENT_DATE)
// to avoid JS Date timezone drift.
const WINDOW_DAYS = 30;

export async function kpi() {
  const [todayRow]  = await query('SELECT COALESCE(SUM(qty),0) AS n FROM qc_defects WHERE stat_date = CURRENT_DATE');
  const [monthRow]  = await query(`SELECT COALESCE(SUM(qty),0) AS n FROM qc_defects WHERE stat_date >= CURRENT_DATE - ${WINDOW_DAYS}`);
  const [topModel]  = await query(`SELECT sku, SUM(qty) AS v FROM qc_defects WHERE stat_date >= CURRENT_DATE - ${WINDOW_DAYS} GROUP BY sku ORDER BY v DESC LIMIT 1`);
  const [topReason] = await query(`SELECT reason, SUM(qty) AS v FROM qc_defects WHERE stat_date >= CURRENT_DATE - ${WINDOW_DAYS} GROUP BY reason ORDER BY v DESC LIMIT 1`);
  return {
    bugunNuqson: Number(todayRow.n),
    oyNuqson: Number(monthRow.n),
    topModel: topModel?.sku || '—',
    topModelCount: Number(topModel?.v || 0),
    topSabab: topReason?.reason || '—',
    topSababCount: Number(topReason?.v || 0),
  };
}

export async function topModels() {
  return query(`SELECT sku AS lbl, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= CURRENT_DATE - ${WINDOW_DAYS} GROUP BY sku ORDER BY v DESC LIMIT 5`);
}

export async function sabablari() {
  return query(`SELECT reason AS lbl, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= CURRENT_DATE - ${WINDOW_DAYS} GROUP BY reason ORDER BY v DESC`);
}

export async function top10() {
  const rows = await query(`SELECT sku AS model, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= CURRENT_DATE - ${WINDOW_DAYS} GROUP BY sku ORDER BY v DESC LIMIT 10`);
  return rows.map((r, i) => ({ rank: i + 1, model: r.model, v: r.v }));
}

const UZ_MONTHS = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];

export async function trend() {
  // Month bucket keyed as 'YYYY-MM' text on the DB side — no JS Date parsing of DB values.
  const rows = await query(
    `SELECT to_char(date_trunc('month', stat_date), 'YYYY-MM') AS mk, SUM(qty)::int AS v
     FROM qc_defects WHERE stat_date >= date_trunc('month', CURRENT_DATE) - interval '5 months'
     GROUP BY 1`);
  const now = new Date();
  const baseIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const months = [], values = [];
  for (let i = 5; i >= 0; i--) {
    const idx = baseIdx - i;
    const y = Math.floor(idx / 12), m = idx % 12;
    const mk = `${y}-${String(m + 1).padStart(2, '0')}`;
    months.push(`${UZ_MONTHS[m]} ${y}`);
    const hit = rows.find((r) => r.mk === mk);
    values.push(hit ? hit.v : 0);
  }
  const badges = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1], cur = values[i];
    const pct = prev === 0 ? (cur === 0 ? '0%' : '+100%') : `${(((cur - prev) / prev) * 100).toFixed(1)}%`;
    const type = cur > prev ? 'green' : cur < prev ? 'neutral' : 'amber';
    badges.push({ from: `${months[i - 1].split(' ')[0]} → ${months[i].split(' ')[0]}`, val: pct, type });
  }
  return { months, values, badges: badges.slice(-2) };
}
