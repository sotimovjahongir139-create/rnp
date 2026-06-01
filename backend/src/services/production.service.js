import { query } from '../config/db.js';

const UZ_MONTHS = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];

async function windowRows(days) {
  return query(
    `SELECT workshop,
            SUM(cards_in)::int AS cards_in, SUM(cards_done)::int AS cards_done,
            SUM(qty_in)::bigint AS qty_in,  SUM(qty_done)::bigint AS qty_done,
            AVG(avg_cycle_days) AS avg_cycle_days
     FROM production_stats WHERE stat_date >= (current_date - $1::int)
     GROUP BY workshop ORDER BY workshop`, [days]);
}

export async function departments() {
  const rows = await windowRows(30);
  return rows.map((r) => {
    const jami = Number(r.qty_in), baj = Number(r.qty_done);
    const pct = jami ? Math.round((baj / jami) * 10000) / 100 : 0;
    return { name: r.workshop, st: pct >= 70 ? 'Normal' : 'Kritik', jami, baj, qol: jami - baj, pct, cards: r.cards_in };
  });
}

export async function kpi() {
  const rows = await windowRows(30);
  const jamiZakaz = rows.reduce((s, r) => s + Number(r.qty_in), 0);
  const jamiKartochka = rows.reduce((s, r) => s + r.cards_in, 0);
  const bajarildi = rows.reduce((s, r) => s + Number(r.qty_done), 0);
  const qoldi = jamiZakaz - bajarildi;
  return {
    jamiZakaz, jamiKartochka, bajarildi, qoldi,
    bajarildiPct: jamiZakaz ? Math.round((bajarildi / jamiZakaz) * 1000) / 10 : 0,
    qoldiPct: jamiZakaz ? Math.round((qoldi / jamiZakaz) * 1000) / 10 : 0,
  };
}

export async function weekly() {
  const rows = await windowRows(7);
  return rows.map((r) => {
    const k = r.cards_in, b = r.cards_done;
    const eff = k ? Math.round((b / k) * 100) : 0;
    const holat = k === 0 ? 'Malumot yoq' : eff >= 70 ? 'Yaxshi' : 'Kritik';
    const sikl = r.avg_cycle_days != null ? `${Number(r.avg_cycle_days).toFixed(1)} kun` : '—';
    return { name: r.workshop, k, b, eff, holat, sikl, mm: '—' };
  });
}

export async function cycle() {
  const rows = await windowRows(30);
  return rows.map((r) => ({ name: r.workshop, v: r.avg_cycle_days != null ? Number(Number(r.avg_cycle_days).toFixed(1)) : 0 }));
}

export async function tendency() {
  const rows = await query(
    `SELECT to_char(date_trunc('month', stat_date), 'YYYY-MM') AS mk,
            SUM(qty_done)::bigint AS done, SUM(qty_in)::bigint AS total
     FROM production_stats WHERE stat_date >= (date_trunc('month', current_date) - interval '5 months')
     GROUP BY 1`, []);
  const now = new Date();
  const baseIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const months = [], values = [];
  for (let i = 5; i >= 0; i--) {
    const idx = baseIdx - i;
    const y = Math.floor(idx / 12), m = idx % 12;
    const mk = `${y}-${String(m + 1).padStart(2, '0')}`;
    months.push(`${UZ_MONTHS[m]} ${y}`);
    const hit = rows.find((r) => r.mk === mk);
    values.push(hit && Number(hit.total) ? Math.round((Number(hit.done) / Number(hit.total)) * 1000) / 10 : 0);
  }
  const badges = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1], cur = values[i];
    const val = prev === 0 ? (cur === 0 ? '0%' : '+100%') : `${cur - prev >= 0 ? '+' : ''}${Math.round(cur - prev)}%`;
    badges.push({ from: `${months[i - 1].split(' ')[0]} → ${months[i].split(' ')[0]}`, val, type: cur > prev ? 'green' : cur < prev ? 'neutral' : 'amber' });
  }
  return { months, values, badges: badges.slice(-3) };
}

export async function sku() { return []; } // no verified source (documented risk)
