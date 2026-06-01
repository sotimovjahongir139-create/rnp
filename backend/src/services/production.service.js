import { analyticsPool } from '../config/db.js';

export async function getKPI({ month, year } = {}) {
  const m = month || new Date().getMonth() + 1;
  const y = year  || new Date().getFullYear();
  const [rows] = await analyticsPool.query(
    `SELECT
       SUM(total_orders)     AS jami,
       SUM(completed_orders) AS bajarildi,
       SUM(remaining_orders) AS qoldi,
       SUM(active_cards)     AS kartochkalar
     FROM production_orders
     WHERE MONTH(order_date)=? AND YEAR(order_date)=?`,
    [m, y]
  );
  const r = rows[0];
  const jami = r.jami || 0;
  const baj  = r.bajarildi || 0;
  return {
    jamiZakaz:     jami,
    jamiKartochka: r.kartochkalar || 0,
    bajarildi:     baj,
    qoldi:         r.qoldi || 0,
    bajarildiPct:  jami ? +((baj / jami) * 100).toFixed(1) : 0,
    qoldiPct:      jami ? +(((jami - baj) / jami) * 100).toFixed(1) : 0,
  };
}

export async function getDepartments({ month, year } = {}) {
  const m = month || new Date().getMonth() + 1;
  const y = year  || new Date().getFullYear();
  const [rows] = await analyticsPool.query(
    `SELECT
       d.name,
       po.status                    AS st,
       SUM(po.total_orders)         AS jami,
       SUM(po.completed_orders)     AS baj,
       SUM(po.remaining_orders)     AS qol,
       ROUND(SUM(po.completed_orders)/NULLIF(SUM(po.total_orders),0)*100,2) AS pct,
       SUM(po.active_cards)         AS cards
     FROM production_orders po
     JOIN departments d ON po.department_id=d.id
     WHERE MONTH(po.order_date)=? AND YEAR(po.order_date)=?
     GROUP BY d.name, po.status`,
    [m, y]
  );
  return rows;
}

export async function getWeekly() {
  const [rows] = await analyticsPool.query(
    `SELECT
       d.name,
       po.incoming_week    AS k,
       po.completed_week   AS b,
       po.efficiency       AS eff,
       po.status           AS holat,
       po.avg_cycle_days   AS sikl,
       po.min_max_days     AS mm
     FROM production_orders po
     JOIN departments d ON po.department_id=d.id
     WHERE po.order_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY d.name, po.status, po.incoming_week, po.completed_week, po.efficiency, po.avg_cycle_days, po.min_max_days`
  );
  return rows;
}

export async function getCycle() {
  const [rows] = await analyticsPool.query(
    `SELECT d.name, ROUND(AVG(po.avg_cycle_days),1) AS v
     FROM production_orders po
     JOIN departments d ON po.department_id=d.id
     WHERE po.order_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY d.name`
  );
  return rows;
}

export async function getTendency() {
  const [rows] = await analyticsPool.query(
    `SELECT DATE_FORMAT(report_month,'%b %Y') AS month_label,
            efficiency_pct AS value
     FROM monthly_reports
     ORDER BY report_month DESC LIMIT 6`
  );
  const reversed = rows.reverse();
  return {
    months: reversed.map((r) => r.month_label),
    values: reversed.map((r) => r.value),
    badges: [],
  };
}

export async function getSKU() {
  const [rows] = await analyticsPool.query(
    `SELECT d.name AS dept, GROUP_CONCAT(DISTINCT s.model_code ORDER BY s.model_code) AS models
     FROM sku_assignments s
     JOIN departments d ON s.department_id=d.id
     GROUP BY d.name`
  );
  return rows.map((r) => ({ dept: r.dept, models: r.models ? r.models.split(',') : [] }));
}
