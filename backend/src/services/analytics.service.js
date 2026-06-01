import { analyticsPool } from '../config/db.js';

export async function getSummary() {
  const [prod, crm, tg] = await Promise.all([
    analyticsPool.query('SELECT COUNT(*) AS total, SUM(completed_orders) AS done FROM production_orders WHERE order_date >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)'),
    analyticsPool.query('SELECT SUM(total_calls) AS total, SUM(missed_calls) AS missed FROM crm_calls WHERE call_date >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)'),
    analyticsPool.query('SELECT COUNT(*) AS total FROM telegram_messages WHERE created_at >= DATE_SUB(NOW(),INTERVAL 30 DAY)'),
  ]);
  return {
    production: prod[0][0],
    crm:        crm[0][0],
    telegram:   tg[0][0],
  };
}

export async function getDailyReport({ date } = {}) {
  const d = date || new Date().toISOString().slice(0, 10);
  const [rows] = await analyticsPool.query(
    'SELECT * FROM daily_reports WHERE report_date=? LIMIT 1', [d]
  );
  return rows[0] || null;
}

export async function getMonthlyReport({ month, year } = {}) {
  const m = month || new Date().getMonth() + 1;
  const y = year  || new Date().getFullYear();
  const [rows] = await analyticsPool.query(
    'SELECT * FROM monthly_reports WHERE MONTH(report_month)=? AND YEAR(report_month)=? LIMIT 1',
    [m, y]
  );
  return rows[0] || null;
}
