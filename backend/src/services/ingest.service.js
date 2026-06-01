import { pool } from '../config/db.js';

// days: [ { stat_date, workshops:[{workshop,cards_in,cards_done,qty_in,qty_done,efficiency_pct,avg_cycle_days}], chain:{...} } ]
export async function upsertProduction(days) {
  const client = await pool.connect();
  let rows = 0;
  try {
    await client.query('BEGIN');
    for (const day of days) {
      await client.query('DELETE FROM production_stats WHERE stat_date = $1', [day.stat_date]);
      for (const w of day.workshops || []) {
        await client.query(
          `INSERT INTO production_stats (stat_date, workshop, cards_in, cards_done, qty_in, qty_done, efficiency_pct, avg_cycle_days)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [day.stat_date, w.workshop, w.cards_in, w.cards_done, w.qty_in, w.qty_done, w.efficiency_pct, w.avg_cycle_days ?? null],
        );
        rows++;
      }
      if (day.chain) {
        const c = day.chain;
        await client.query(
          `INSERT INTO production_chain (stat_period, sklad_zakaz, sklad_kirim, sklad_kirim_done, sklad_chiqim, sklad_chiqim_approved)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (stat_period) DO UPDATE SET sklad_zakaz=EXCLUDED.sklad_zakaz, sklad_kirim=EXCLUDED.sklad_kirim,
             sklad_kirim_done=EXCLUDED.sklad_kirim_done, sklad_chiqim=EXCLUDED.sklad_chiqim,
             sklad_chiqim_approved=EXCLUDED.sklad_chiqim_approved, updated_at=now()`,
          [c.stat_period, c.sklad_zakaz, c.sklad_kirim, c.sklad_kirim_done, c.sklad_chiqim, c.sklad_chiqim_approved],
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { days: days.length, rows };
}
