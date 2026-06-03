import { analyticsPool } from '../config/db.js';

export async function getMonthlyStats({ month, year } = {}) {
  const m = month || new Date().getMonth() + 1;
  const y = year  || new Date().getFullYear();
  const firstDay = `${y}-${String(m).padStart(2,'0')}-01`;
  const [rows] = await analyticsPool.query(
    `SELECT
       SUM(total_calls)          AS jami,
       SUM(incoming_calls)       AS kiruvchi,
       SUM(outgoing_calls)       AS chiquvchi,
       SUM(missed_calls)         AS otkazib,
       SUM(recalled_calls)       AS qayta_chiqilgan,
       SUM(not_recalled)         AS qayta_chiqilmagan,
       ROUND(AVG(answer_rate),1) AS javob_pct,
       ROUND(AVG(recall_rate),1) AS qayta_pct,
       ROUND(AVG(avg_recall_minutes),1) AS avg_recall_daq
     FROM amo_call_monthly_stats
     WHERE stat_month = ?`,
    [firstDay]
  );
  const r = rows[0];
  return {
    jami:             r.jami              || 0,
    kiruvchi:         r.kiruvchi          || 0,
    chiquvchi:        r.chiquvchi         || 0,
    otkazib:          r.otkazib           || 0,
    qaytaChiqilgan:   r.qayta_chiqilgan   || 0,
    qaytaChiqilmagan: r.qayta_chiqilmagan || 0,
    otkazibPct:       (100 - (r.javob_pct || 0)).toFixed(1) + '%',
    missedStats: {
      qaytaChiqilgan:   r.qayta_chiqilgan   || 0,
      qaytaChiqilmagan: r.qayta_chiqilmagan || 0,
      qaytaAloqaDaq:    String(r.avg_recall_daq || '0'),
    },
    bars: [
      { lbl: 'Javob berish',      pct: +(r.javob_pct  || 0), cls: 'g' },
      { lbl: 'Qayta chiqish',     pct: +(r.qayta_pct  || 0), cls: 'a' },
      { lbl: 'Qayta chiqilmagan', pct: r.qayta_chiqilgan && r.qayta_chiqilmagan
          ? Math.round(r.qayta_chiqilmagan / (r.qayta_chiqilgan + r.qayta_chiqilmagan) * 100) : 0, cls: 'r' },
    ],
  };
}

export async function getDailyStats({ date } = {}) {
  const d = date || new Date().toISOString().slice(0, 10);
  const [rows] = await analyticsPool.query(
    `SELECT
       SUM(total_calls)          AS jami,
       SUM(incoming_calls)       AS kiruvchi,
       SUM(outgoing_calls)       AS chiquvchi,
       SUM(missed_calls)         AS otkazib,
       SUM(recalled_calls)       AS qayta_chiqilgan,
       SUM(not_recalled)         AS qayta_chiqilmagan,
       ROUND(AVG(answer_rate),1) AS javob_pct,
       ROUND(AVG(recall_rate),1) AS qayta_pct,
       ROUND(AVG(avg_recall_minutes),1) AS avg_recall_daq
     FROM amo_call_daily_stats WHERE stat_date = ?`,
    [d]
  );
  const r = rows[0];
  return {
    jami:             r.jami              || 0,
    kiruvchi:         r.kiruvchi          || 0,
    chiquvchi:        r.chiquvchi         || 0,
    otkazib:          r.otkazib           || 0,
    qaytaChiqilgan:   r.qayta_chiqilgan   || 0,
    qaytaChiqilmagan: r.qayta_chiqilmagan || 0,
    otkazibPct:       (100 - (r.javob_pct || 0)).toFixed(1) + '%',
    missedStats: {
      qaytaChiqilgan:   r.qayta_chiqilgan   || 0,
      qaytaChiqilmagan: r.qayta_chiqilmagan || 0,
      qaytaAloqaDaq:    String(r.avg_recall_daq || '0'),
    },
    bars: [
      { lbl: 'Javob berish',      pct: +(r.javob_pct  || 0), cls: 'g' },
      { lbl: 'Qayta chiqish',     pct: +(r.qayta_pct  || 0), cls: 'a' },
      { lbl: 'Qayta chiqilmagan', pct: r.qayta_chiqilgan && r.qayta_chiqilmagan
          ? Math.round(r.qayta_chiqilmagan / (r.qayta_chiqilgan + r.qayta_chiqilmagan) * 100) : 0, cls: 'r' },
    ],
  };
}

export async function getHourlyDistribution({ month, year } = {}) {
  const m = month || new Date().getMonth() + 1;
  const y = year  || new Date().getFullYear();
  const [rows] = await analyticsPool.query(
    `SELECT hour_slot AS lbl, SUM(call_count) AS v
     FROM crm_hourly_stats
     WHERE MONTH(stat_date)=? AND YEAR(stat_date)=?
     GROUP BY hour_slot ORDER BY hour_slot`,
    [m, y]
  );
  return rows;
}

export async function getHourlyToday() {
  const today = new Date().toISOString().slice(0, 10);
  const [rows] = await analyticsPool.query(
    `SELECT hour_slot AS lbl, SUM(call_count) AS v
     FROM crm_hourly_stats WHERE stat_date=?
     GROUP BY hour_slot ORDER BY hour_slot`,
    [today]
  );
  return rows;
}

export async function getTelegramKPI({ date } = {}) {
  const d = date || new Date().toISOString().slice(0, 10);
  const [rows] = await analyticsPool.query(
    `SELECT
       answered_turns          AS javob_berilgan,
       waiting_turns           AS kutilayotgan,
       response_rate           AS javob_pct,
       avg_response_minutes    AS avg_daq,
       median_response_minutes AS median_daq,
       client_messages         AS client_msgs,
       manager_messages        AS manager_msgs,
       unique_contacts         AS unik_contacts
     FROM telegram_daily_stats WHERE report_date = ?
     ORDER BY loaded_at DESC LIMIT 1`,
    [d]
  );
  const r = rows[0] || {};
  return {
    jamiXabarlar:      (r.client_msgs || 0) + (r.manager_msgs || 0),
    mijozXabarlari:    r.client_msgs    || 0,
    menejerJavoblari:  r.manager_msgs   || 0,
    ortachaJavobVaqti: String(r.avg_daq    || '0'),
    medianJavobDaq:    String(r.median_daq || '0'),
    javobDarajasi:     (r.javob_pct || 0) + '%',
    murojaatHal:       r.javob_berilgan
      ? Math.round((r.javob_berilgan / ((r.javob_berilgan || 0) + (r.kutilayotgan || 0))) * 100) + '%'
      : '0%',
  };
}

export async function getMessageCategories({ date } = {}) {
  const d = date || new Date().toISOString().slice(0, 10);
  const [rows] = await analyticsPool.query(
    `SELECT status, COUNT(*) AS v, ROUND(AVG(response_minutes),1) AS avg_daq
     FROM telegram_response_details
     WHERE report_date = ?
     GROUP BY status`,
    [d]
  );
  const answered = rows.find(r => r.status === 'ANSWERED') || { v: 0 };
  const waiting  = rows.find(r => r.status === 'WAITING')  || { v: 0 };
  return [
    { lbl: 'Menejer javoblari',  v: answered.v || 0, c: '#3B6FD4' },
    { lbl: 'Javob kutilayotgan', v: waiting.v  || 0, c: '#C03434',
      pct: answered.v + waiting.v > 0
        ? (waiting.v / (answered.v + waiting.v) * 100).toFixed(2) + '%'
        : null },
  ];
}
