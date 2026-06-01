import { query } from '../config/db.js';
export async function all() {
  const rows = await query('SELECT period_type, period_date, department, metric, value, status FROM kpi_results ORDER BY period_date DESC, metric', []);
  return rows;
}
