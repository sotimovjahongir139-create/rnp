import mysql2        from 'mysql2/promise';
import { env }       from './env.js';

export const analyticsPool = mysql2.createPool({
  host:               env.analyticsDbHost,
  port:               env.analyticsDbPort,
  user:               env.analyticsDbUser,
  password:           env.analyticsDbPass,
  database:           env.analyticsDbName,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+05:00',
});

export const productionPool = env.prodDbHost
  ? mysql2.createPool({
      host:               env.prodDbHost,
      port:               env.prodDbPort,
      user:               env.prodDbUser,
      password:           env.prodDbPass,
      database:           env.prodDbName,
      waitForConnections: true,
      connectionLimit:    5,
      queueLimit:         0,
    })
  : null;

export async function testConnections() {
  try {
    await analyticsPool.query('SELECT 1');
    console.log('[DB] Analytics DB connected');
  } catch (e) {
    console.error('[DB] Analytics DB failed:', e.message);
  }

  if (productionPool) {
    try {
      await productionPool.query('SELECT 1');
      console.log('[DB] Production DB connected');
    } catch (e) {
      console.error('[DB] Production DB failed:', e.message);
    }
  }
}
