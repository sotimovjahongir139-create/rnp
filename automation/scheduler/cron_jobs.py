"""
Scheduler — runs ETL jobs manually or via cron.
On Ahost cPanel, configure cron to call:
    python /path/to/automation/scheduler/cron_jobs.py --job=all
"""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from production.production_etl import run_etl as run_production_etl
from crm.crm_sync import sync as run_crm_sync

LOG_DIR = Path(__file__).parent.parent / 'logs'
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s — %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'scheduler.log'),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger('scheduler')

JOBS = {
    'production': run_production_etl,
    'crm':        lambda: run_crm_sync(),  # pass data from parsers in production
}

def run_job(name: str):
    if name not in JOBS and name != 'all':
        log.error(f"Unknown job: {name}. Available: {list(JOBS)}, all")
        sys.exit(1)

    targets = list(JOBS.keys()) if name == 'all' else [name]
    for job_name in targets:
        log.info(f"─── Running job: {job_name} ───")
        try:
            JOBS[job_name]()
            log.info(f"Job {job_name} completed ✓")
        except Exception as e:
            log.error(f"Job {job_name} failed: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='RNP ETL scheduler')
    parser.add_argument('--job', default='all', help='Job name: production | crm | all')
    args = parser.parse_args()
    run_job(args.job)
