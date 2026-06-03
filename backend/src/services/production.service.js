import { analyticsPool } from '../config/db.js';

export async function getDepartments() {
  const [rows] = await analyticsPool.query(
    `SELECT d.name, po.status, po.total_orders AS jami, po.completed_orders AS baj,
            po.remaining_orders AS qol, po.efficiency AS pct, po.active_cards AS cards,
            po.avg_cycle_days, po.incoming_week AS k, po.completed_week AS b
     FROM production_orders po
     JOIN departments d ON d.id = po.department_id
     WHERE po.order_date = (SELECT MAX(order_date) FROM production_orders)
     ORDER BY d.name`
  );
  return rows.map((r) => ({
    name:  r.name,
    st:    r.status || 'Normal',
    jami:  r.jami   || 0,
    baj:   r.baj    || 0,
    qol:   r.qol    || 0,
    pct:   Number(r.pct) || 0,
    cards: r.cards  || 0,
  }));
}

export async function getProductionKPI() {
  const [rows] = await analyticsPool.query(
    `SELECT SUM(total_orders) AS jami, SUM(active_cards) AS kartochka,
            SUM(completed_orders) AS baj, SUM(remaining_orders) AS qol
     FROM production_orders
     WHERE order_date = (SELECT MAX(order_date) FROM production_orders)`
  );
  const r = rows[0] || {};
  const jami = r.jami || 0;
  const baj  = r.baj  || 0;
  const qol  = r.qol  || 0;
  return {
    jamiZakaz:    jami,
    jamiKartochka: r.kartochka || 0,
    bajarildi:    baj,
    qoldi:        qol,
    bajarildiPct: jami ? +((baj / jami) * 100).toFixed(1) : 0,
    qoldiPct:     jami ? +((qol / jami) * 100).toFixed(1) : 0,
  };
}

export async function getWeekly() {
  const [rows] = await analyticsPool.query(
    `SELECT d.name, po.incoming_week AS k, po.completed_week AS b,
            po.efficiency AS eff, po.status AS holat,
            po.avg_cycle_days AS sikl, po.min_max_days AS mm
     FROM production_orders po
     JOIN departments d ON d.id = po.department_id
     WHERE po.order_date = (SELECT MAX(order_date) FROM production_orders)
     ORDER BY d.name`
  );
  return rows.map((r) => ({
    name:  r.name,
    k:     r.k    || 0,
    b:     r.b    || 0,
    eff:   Number(r.eff) || 0,
    holat: r.holat || 'Normal',
    sikl:  r.sikl ? r.sikl + ' kun' : '—',
    mm:    r.mm   || '—',
  }));
}

export async function getCycle() {
  const [rows] = await analyticsPool.query(
    `SELECT d.name, po.avg_cycle_days AS v
     FROM production_orders po
     JOIN departments d ON d.id = po.department_id
     WHERE po.order_date = (SELECT MAX(order_date) FROM production_orders)
     ORDER BY d.name`
  );
  return rows.map((r) => ({ name: r.name, v: Number(r.v) || 0 }));
}

export async function getTendency() {
  const [rows] = await analyticsPool.query(
    `SELECT DATE_FORMAT(order_date, '%b %Y') AS mon,
            ROUND(AVG(efficiency), 1) AS val
     FROM production_orders
     GROUP BY YEAR(order_date), MONTH(order_date)
     ORDER BY MIN(order_date) DESC
     LIMIT 6`
  );
  const reversed = rows.reverse();
  const months = reversed.map((r) => r.mon);
  const values = reversed.map((r) => Number(r.val) || 0);
  const badges = [];
  for (let i = 1; i < reversed.length; i++) {
    const prev = values[i - 1], cur = values[i];
    const diff = cur - prev;
    badges.push({
      from: `${months[i - 1]} → ${months[i]}`,
      val:  (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%',
      type: diff > 0 ? 'green' : diff < 0 ? 'neutral' : 'amber',
    });
  }
  return { months, values, badges };
}

export async function getSKU() {
  const [rows] = await analyticsPool.query(
    `SELECT d.name AS dept, sa.model_code AS model
     FROM sku_assignments sa
     JOIN departments d ON d.id = sa.department_id
     ORDER BY d.name, sa.model_code`
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.dept]) map[r.dept] = { dept: r.dept, models: [] };
    map[r.dept].models.push(r.model);
  }
  return Object.values(map);
}
