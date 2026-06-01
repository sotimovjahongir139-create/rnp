/**
 * CRM Sync Job
 * Triggers the Python ETL via child_process OR
 * directly inserts data if already parsed externally.
 */
import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../middleware/logger.js';

const AUTOMATION_DIR = path.resolve('..', 'automation');

export async function syncCRM() {
  return new Promise((resolve, reject) => {
    logger.info('[Job] CRM sync started');
    const py = spawn('python', [
      path.join(AUTOMATION_DIR, 'scheduler', 'cron_jobs.py'),
      '--job=crm',
    ]);

    py.stdout.on('data', (d) => logger.info(`[crm-etl] ${d.toString().trim()}`));
    py.stderr.on('data', (d) => logger.error(`[crm-etl] ${d.toString().trim()}`));

    py.on('close', (code) => {
      if (code === 0) {
        logger.info('[Job] CRM sync completed');
        resolve({ job: 'crm', status: 'ok' });
      } else {
        logger.error(`[Job] CRM sync exited with code ${code}`);
        reject(new Error(`CRM sync failed (exit ${code})`));
      }
    });
  });
}
