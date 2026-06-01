/**
 * KPI Calculation Engine
 * Reads raw data from analytics DB, computes KPIs, stores into kpi_results.
 * Called manually via /api/sync or scheduled via cPanel cron.
 */
import { analyticsPool } from '../config/db.js';
import { logger } from '../middleware/logger.js';
import { KPI_THRESHOLDS } from '../config/constants.js';

export async function calculateDailyKPI(date = null) {
  const d = date || new Date().toISOString().slice(0, 10);
  logger.info(`[KPI] Calculating daily KPI for ${d}`);

  const conn = await analyticsPool.getConnection();
  try {
    // ─── CRM KPIs ──────────────────────────────────────────────
    const [[calls]] = await conn.query(
      `SELECT
         COALESCE(SUM(total_calls),0)  AS total,
         COALESCE(SUM(missed_calls),0) AS missed,
         COALESCE(SUM(callback_made),0)  AS callback_ok,
         COALESCE(AVG(avg_call_duration),0) AS avg_dur
       FROM crm_calls WHERE call_date=?`,
      [d]
    );

    const missedPct = calls.total > 0
      ? +((calls.missed / calls.total) * 100).toFixed(2)
      : 0;

    // ─── Telegram KPIs ─────────────────────────────────────────
    const [[tg]] = await conn.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(AVG(response_time_min),0) AS avg_resp,
         ROUND(SUM(is_resolved)/NULLIF(COUNT(*),0)*100,2) AS resolved_pct
       FROM telegram_messages WHERE DATE(created_at)=?`,
      [d]
    );

    // ─── Production KPIs ───────────────────────────────────────
    const [[prod]] = await conn.query(
      `SELECT
         COALESCE(SUM(total_orders),0)     AS total,
         COALESCE(SUM(completed_orders),0) AS done,
         COALESCE(AVG(avg_cycle_days),0)   AS avg_cycle,
         COALESCE(AVG(efficiency),0)       AS avg_eff
       FROM production_orders WHERE order_date=?`,
      [d]
    );

    const effPct = prod.total > 0
      ? +((prod.done / prod.total) * 100).toFixed(2)
      : 0;

    // ─── Trend score (simple weighted) ────────────────────────
    const trendScore = +(
      (100 - missedPct) * 0.4 +
      effPct * 0.4 +
      (tg.resolved_pct || 0) * 0.2
    ).toFixed(2);

    // ─── Upsert into kpi_results ──────────────────────────────
    await conn.query(
      `INSERT INTO kpi_results
         (period_type, period_date, total_calls, missed_calls, missed_pct,
          efficiency_pct, avg_cycle_days, avg_response_min, telegram_resolution, trend_score)
       VALUES ('daily', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_calls=VALUES(total_calls), missed_calls=VALUES(missed_calls),
         missed_pct=VALUES(missed_pct), efficiency_pct=VALUES(efficiency_pct),
         avg_cycle_days=VALUES(avg_cycle_days), avg_response_min=VALUES(avg_response_min),
         telegram_resolution=VALUES(telegram_resolution), trend_score=VALUES(trend_score)`,
      [d, calls.total, calls.missed, missedPct, effPct,
       prod.avg_cycle, tg.avg_resp, tg.resolved_pct || 0, trendScore]
    );

    // ─── Upsert daily_reports summary ─────────────────────────
    await conn.query(
      `INSERT INTO daily_reports
         (report_date, total_calls, missed_calls, tg_messages, prod_orders, prod_done)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_calls=VALUES(total_calls), missed_calls=VALUES(missed_calls),
         tg_messages=VALUES(tg_messages), prod_orders=VALUES(prod_orders), prod_done=VALUES(prod_done)`,
      [d, calls.total, calls.missed, tg.total, prod.total, prod.done]
    );

    logger.info(`[KPI] Daily KPI saved — missed: ${missedPct}%, eff: ${effPct}%, trend: ${trendScore}`);

    // ─── Alerts ───────────────────────────────────────────────
    if (missedPct >= KPI_THRESHOLDS.missedCallCritical)
      logger.warn(`[KPI] ALERT: Missed call % is critical: ${missedPct}%`);
    if (effPct < KPI_THRESHOLDS.efficiencyCritical)
      logger.warn(`[KPI] ALERT: Production efficiency critical: ${effPct}%`);

    return { date: d, missedPct, effPct, trendScore };
  } finally {
    conn.release();
  }
}

export async function calculateMonthlyKPI(month = null, year = null) {
  const now = new Date();
  const m = month || now.getMonth() + 1;
  const y = year  || now.getFullYear();
  const periodDate = `${y}-${String(m).padStart(2,'0')}-01`;
  logger.info(`[KPI] Calculating monthly KPI for ${y}-${m}`);

  const conn = await analyticsPool.getConnection();
  try {
    const [[calls]] = await conn.query(
      `SELECT COALESCE(SUM(total_calls),0) AS total, COALESCE(SUM(missed_calls),0) AS missed
       FROM crm_calls WHERE MONTH(call_date)=? AND YEAR(call_date)=?`, [m, y]
    );
    const [[tg]] = await conn.query(
      `SELECT COUNT(*) AS total, ROUND(SUM(is_resolved)/NULLIF(COUNT(*),0)*100,2) AS resolved_pct,
              COALESCE(AVG(response_time_min),0) AS avg_resp
       FROM telegram_messages WHERE MONTH(created_at)=? AND YEAR(created_at)=?`, [m, y]
    );
    const [[prod]] = await conn.query(
      `SELECT COALESCE(SUM(total_orders),0) AS total, COALESCE(SUM(completed_orders),0) AS done,
              COALESCE(AVG(efficiency),0) AS avg_eff
       FROM production_orders WHERE MONTH(order_date)=? AND YEAR(order_date)=?`, [m, y]
    );

    const missedPct = calls.total > 0 ? +((calls.missed / calls.total) * 100).toFixed(2) : 0;
    const effPct    = prod.total   > 0 ? +((prod.done  / prod.total)   * 100).toFixed(2) : 0;
    const trendScore= +((100 - missedPct)*0.4 + effPct*0.4 + (tg.resolved_pct||0)*0.2).toFixed(2);

    await conn.query(
      `INSERT INTO kpi_results
         (period_type, period_date, total_calls, missed_calls, missed_pct,
          efficiency_pct, avg_response_min, telegram_resolution, trend_score)
       VALUES ('monthly', ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_calls=VALUES(total_calls), missed_calls=VALUES(missed_calls),
         missed_pct=VALUES(missed_pct), efficiency_pct=VALUES(efficiency_pct),
         avg_response_min=VALUES(avg_response_min),
         telegram_resolution=VALUES(telegram_resolution), trend_score=VALUES(trend_score)`,
      [periodDate, calls.total, calls.missed, missedPct, effPct, tg.avg_resp, tg.resolved_pct||0, trendScore]
    );

    await conn.query(
      `INSERT INTO monthly_reports
         (report_month, total_calls, missed_calls, tg_messages, prod_orders, prod_done, efficiency_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_calls=VALUES(total_calls), missed_calls=VALUES(missed_calls),
         tg_messages=VALUES(tg_messages), prod_orders=VALUES(prod_orders),
         prod_done=VALUES(prod_done), efficiency_pct=VALUES(efficiency_pct)`,
      [periodDate, calls.total, calls.missed, tg.total, prod.total, prod.done, effPct]
    );

    logger.info(`[KPI] Monthly KPI saved for ${y}-${m}`);
    return { period: `${y}-${m}`, missedPct, effPct, trendScore };
  } finally {
    conn.release();
  }
}

export async function calculateDepartmentKPIs(date = null) {
  const d = date || new Date().toISOString().slice(0, 10);
  const conn = await analyticsPool.getConnection();
  try {
    const [depts] = await conn.query(
      `SELECT po.department_id,
              COALESCE(SUM(po.total_orders),0)     AS total,
              COALESCE(SUM(po.completed_orders),0) AS done,
              COALESCE(AVG(po.avg_cycle_days),0)   AS avg_cycle,
              COALESCE(AVG(po.efficiency),0)        AS eff
       FROM production_orders po
       WHERE po.order_date=?
       GROUP BY po.department_id`, [d]
    );

    for (const dept of depts) {
      const effPct = dept.total > 0 ? +((dept.done / dept.total) * 100).toFixed(2) : 0;
      await conn.query(
        `INSERT INTO kpi_results
           (period_type, period_date, department_id, efficiency_pct, avg_cycle_days)
         VALUES ('daily', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE efficiency_pct=VALUES(efficiency_pct), avg_cycle_days=VALUES(avg_cycle_days)`,
        [d, dept.department_id, effPct, dept.avg_cycle]
      );
    }
    logger.info(`[KPI] Department KPIs calculated for ${d} (${depts.length} depts)`);
  } finally {
    conn.release();
  }
}
