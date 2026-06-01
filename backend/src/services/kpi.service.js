import { analyticsPool } from '../config/db.js';

export async function getAllKPI({ date } = {}) {
  const [daily, monthly] = await Promise.all([getDailyKPI({ date }), getMonthlyKPI()]);
  return { daily, monthly };
}

export async function getDailyKPI({ date } = {}) {
  const d = date || new Date().toISOString().slice(0, 10);
  const [rows] = await analyticsPool.query(
    'SELECT * FROM kpi_results WHERE period_type="daily" AND period_date=? LIMIT 1', [d]
  );
  return rows[0] || null;
}

export async function getMonthlyKPI({ month, year } = {}) {
  const m = month || new Date().getMonth() + 1;
  const y = year  || new Date().getFullYear();
  const [rows] = await analyticsPool.query(
    'SELECT * FROM kpi_results WHERE period_type="monthly" AND MONTH(period_date)=? AND YEAR(period_date)=? LIMIT 1',
    [m, y]
  );
  return rows[0] || null;
}

export async function getDepartmentKPI({ dept } = {}) {
  const [rows] = await analyticsPool.query(
    `SELECT kr.*, d.name AS dept_name
     FROM kpi_results kr
     JOIN departments d ON kr.department_id=d.id
     WHERE (d.name=? OR ?='' OR ? IS NULL)
       AND kr.period_type='daily'
     ORDER BY kr.period_date DESC LIMIT 10`,
    [dept, dept, dept]
  );
  return rows;
}
