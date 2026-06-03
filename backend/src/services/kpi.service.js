import { analyticsPool } from '../config/db.js';

export async function getDailyKPI() {
  const [rows] = await analyticsPool.query(
    `SELECT period_date, department_id, total_calls, missed_calls,
            missed_pct, efficiency_pct, avg_cycle_days, avg_response_min
     FROM kpi_results WHERE period_type='daily'
     ORDER BY period_date DESC LIMIT 20`
  );
  return rows;
}

export async function getMonthlyKPI() {
  const [rows] = await analyticsPool.query(
    `SELECT period_date, department_id, total_calls, missed_calls,
            missed_pct, efficiency_pct, avg_cycle_days, avg_response_min
     FROM kpi_results WHERE period_type='monthly'
     ORDER BY period_date DESC LIMIT 12`
  );
  return rows;
}
