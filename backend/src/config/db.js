import mysql from 'mysql2/promise';
import { env } from './env.js';

// Analytics DB — read/write (central)
export const analyticsPool = mysql.createPool({
  host:               env.analyticsDb.host,
  port:               env.analyticsDb.port,
  user:               env.analyticsDb.user,
  password:           env.analyticsDb.password,
  database:           env.analyticsDb.database,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 30000,
});

// Production MySQL — read-only
export const prodPool = env.prodDb.host
  ? mysql.createPool({
      host:               env.prodDb.host,
      port:               env.prodDb.port,
      user:               env.prodDb.user,
      password:           env.prodDb.password,
      database:           env.prodDb.database,
      waitForConnections: true,
      connectionLimit:    5,
      queueLimit:         0,
      enableKeepAlive:    true,
      keepAliveInitialDelay: 30000,
    })
  : null;

export async function testConnections() {
  try {
    await analyticsPool.query('SELECT 1');
    console.log('[DB] Analytics DB connected');
  } catch (e) {
    console.error('[DB] Analytics DB connection failed:', e.message);
  }
  if (prodPool) {
    try {
      await prodPool.query('SELECT 1');
      console.log('[DB] Production DB connected');
    } catch (e) {
      console.error('[DB] Production DB connection failed:', e.message);
    }
  }
}
