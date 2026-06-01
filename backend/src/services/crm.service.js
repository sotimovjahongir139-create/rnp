import { query } from '../config/db.js';

const HOUR_KEYS = [['09–11','h_09_11'],['11–13','h_11_13'],['13–15','h_13_15'],['15–17','h_15_17'],['17–19','h_17_19'],['19–21','h_19_21'],['21–23','h_21_23']];

async function latestCall(periodType) {
  const rows = await query(
    'SELECT * FROM call_stats WHERE period_type=$1 ORDER BY period_date DESC LIMIT 1', [periodType]);
  return rows[0] || null;
}

function callShape(r) {
  if (!r) return { jami: 0, kiruvchi: 0, chiquvchi: 0, otkazib: 0, qaytaChiqilgan: 0, qaytaChiqilmagan: 0,
    otkazibPct: '0%', missedStats: { qaytaChiqilgan: 0, qaytaChiqilmagan: 0, qaytaAloqaDaq: '0' },
    bars: [{ lbl: 'Javob berish', pct: 0, cls: 'g' }, { lbl: 'Qayta chiqish', pct: 0, cls: 'a' }, { lbl: 'Qayta chiqilmagan', pct: 0, cls: 'r' }] };
  const total = r.total_calls;
  return {
    jami: total, kiruvchi: r.incoming_answered, chiquvchi: r.outgoing_answered, otkazib: r.missed_clients,
    qaytaChiqilgan: r.recalled_clients, qaytaChiqilmagan: r.not_recalled_clients,
    otkazibPct: total ? `${((r.missed_clients / total) * 100).toFixed(1)}%` : '0%',
    missedStats: { qaytaChiqilgan: r.recalled_clients, qaytaChiqilmagan: r.not_recalled_clients,
      qaytaAloqaDaq: Number(r.avg_recall_minutes).toLocaleString('en-US') },
    bars: [{ lbl: 'Javob berish', pct: Number(r.answer_rate), cls: 'g' },
           { lbl: 'Qayta chiqish', pct: Number(r.recall_rate), cls: 'a' },
           { lbl: 'Qayta chiqilmagan', pct: Number(r.no_recall_pct), cls: 'r' }],
  };
}

export async function monthly() { return callShape(await latestCall('monthly')); }
export async function daily()   { return callShape(await latestCall('daily')); }

function hourShape(r) { return HOUR_KEYS.map(([lbl, col]) => ({ lbl, v: r ? r[col] : 0 })); }
export async function hourly()      { return hourShape(await latestCall('monthly')); }
export async function hourlyToday() { return hourShape(await latestCall('daily')); }

export async function telegramKpi() {
  const [r] = await query('SELECT * FROM telegram_stats ORDER BY report_date DESC LIMIT 1', []);
  if (!r) return { jamiXabarlar: 0, mijozXabarlari: 0, menejerJavoblari: 0, ortachaJavobVaqti: '0.00', javobDarajasi: '0%', murojaatHal: '0%' };
  return {
    jamiXabarlar: r.total_events, mijozXabarlari: r.client_messages, menejerJavoblari: r.manager_messages,
    ortachaJavobVaqti: Number(r.avg_response_minutes || 0).toFixed(2),
    javobDarajasi: r.client_messages ? `${Math.min(100, Math.round((r.manager_messages / r.client_messages) * 100))}%` : '0%',
    murojaatHal: `${Number(r.response_rate).toFixed(2)}%`,
  };
}

export async function telegramCategories() {
  const [r] = await query('SELECT * FROM telegram_stats ORDER BY report_date DESC LIMIT 1', []);
  if (!r) return [];
  const ct = r.client_turns;
  return [
    { lbl: 'Menejer javoblari', v: r.manager_messages, c: '#3B6FD4' },
    { lbl: 'Mijoz xabarlari', v: r.client_messages, c: '#34C377' },
    { lbl: 'Mijoz murojaatlari', v: ct, c: '#7B5EA7' },
    { lbl: 'Javob berilgan', v: r.answered_turns, c: '#287D4F' },
    { lbl: 'Javob kutilayotgan', v: r.waiting_turns, c: '#C03434', pct: `${(ct ? (r.waiting_turns / ct) * 100 : 0).toFixed(2)}%` },
  ];
}
