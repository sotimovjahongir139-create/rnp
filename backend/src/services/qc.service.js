import { query } from '../config/db.js';

const monthBounds = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  return start;
};

export async function kpi() {
  const monthStart = monthBounds();
  const today = new Date().toISOString().slice(0, 10);
  const [todayRow] = await query('SELECT COALESCE(SUM(qty),0) AS n FROM qc_defects WHERE stat_date = $1', [today]);
  const [monthRow] = await query('SELECT COALESCE(SUM(qty),0) AS n FROM qc_defects WHERE stat_date >= $1', [monthStart]);
  const [topModel] = await query('SELECT sku, SUM(qty) AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY sku ORDER BY v DESC LIMIT 1', [monthStart]);
  const [topReason] = await query('SELECT reason, SUM(qty) AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY reason ORDER BY v DESC LIMIT 1', [monthStart]);
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
  const monthStart = monthBounds();
  return query('SELECT sku AS lbl, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY sku ORDER BY v DESC LIMIT 5', [monthStart]);
}

export async function sabablari() {
  const monthStart = monthBounds();
  return query('SELECT reason AS lbl, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY reason ORDER BY v DESC', [monthStart]);
}

export async function top10() {
  const monthStart = monthBounds();
  const rows = await query('SELECT sku AS model, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY sku ORDER BY v DESC LIMIT 10', [monthStart]);
  return rows.map((r, i) => ({ rank: i + 1, model: r.model, v: r.v }));
}

const UZ_MONTHS = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];

export async function trend() {
  const rows = await query(
    `SELECT date_trunc('month', stat_date)::date AS m, SUM(qty)::int AS v
     FROM qc_defects WHERE stat_date >= (date_trunc('month', now()) - interval '5 months')
     GROUP BY 1 ORDER BY 1`, []);
  const months = [], values = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${UZ_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`);
    const hit = rows.find((r) => new Date(r.m).getUTCMonth() === d.getUTCMonth() && new Date(r.m).getUTCFullYear() === d.getUTCFullYear());
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
