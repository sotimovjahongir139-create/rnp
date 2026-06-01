import pg from 'pg';
import { loadEnv } from './env.js';

const { Pool } = pg;
const env = loadEnv();

export const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function ping() {
  try { await pool.query('SELECT 1'); return true; } catch { return false; }
}
