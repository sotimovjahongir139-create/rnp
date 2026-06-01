import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../middleware/logger.js';

const AUTOMATION_DIR = path.resolve('..', 'automation');

export async function syncProduction() {
  return new Promise((resolve, reject) => {
    logger.info('[Job] Production sync started');
    const py = spawn('python', [
      path.join(AUTOMATION_DIR, 'scheduler', 'cron_jobs.py'),
      '--job=production',
    ]);

    py.stdout.on('data', (d) => logger.info(`[prod-etl] ${d.toString().trim()}`));
    py.stderr.on('data', (d) => logger.error(`[prod-etl] ${d.toString().trim()}`));

    py.on('close', (code) => {
      if (code === 0) {
        logger.info('[Job] Production sync completed');
        resolve({ job: 'production', status: 'ok' });
      } else {
        logger.error(`[Job] Production sync exited with code ${code}`);
        reject(new Error(`Production sync failed (exit ${code})`));
      }
    });
  });
}
