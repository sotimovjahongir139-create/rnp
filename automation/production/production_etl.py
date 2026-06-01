"""
Production ETL — reads from phpMyAdmin MySQL (production DB),
normalizes, and writes to rnp_analytics DB.
Existing mysql_sync.py is the source — do not modify it.
"""
import os
import sys
import logging
from datetime import date
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / '.env')

LOG_DIR = Path(__file__).parent.parent / 'logs'
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'production_etl.log'),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger('production_etl')

def get_prod_conn():
    return mysql.connector.connect(
        host=os.getenv('PROD_DB_HOST'),
        port=int(os.getenv('PROD_DB_PORT', 3306)),
        user=os.getenv('PROD_DB_USER'),
        password=os.getenv('PROD_DB_PASS'),
        database=os.getenv('PROD_DB_NAME'),
        connection_timeout=10,
    )

def get_analytics_conn():
    return mysql.connector.connect(
        host=os.getenv('ANALYTICS_DB_HOST', 'localhost'),
        port=int(os.getenv('ANALYTICS_DB_PORT', 3306)),
        user=os.getenv('ANALYTICS_DB_USER'),
        password=os.getenv('ANALYTICS_DB_PASS'),
        database=os.getenv('ANALYTICS_DB_NAME', 'rnp_analytics'),
        connection_timeout=10,
    )

def fetch_production_data(prod_conn) -> list:
    """
    Query production MySQL (phpMyAdmin) for today's order data.
    Adjust the SQL to match the actual production DB schema.
    """
    cursor = prod_conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            department_name,
            SUM(total)      AS total_orders,
            SUM(completed)  AS completed_orders,
            SUM(remaining)  AS remaining_orders,
            SUM(cards)      AS active_cards,
            ROUND(SUM(completed)/NULLIF(SUM(total),0)*100,2) AS efficiency
        FROM production_table
        WHERE order_date = CURDATE()
        GROUP BY department_name
    """)
    rows = cursor.fetchall()
    cursor.close()
    return rows

def get_or_create_dept(analytics_conn, name: str) -> int:
    cursor = analytics_conn.cursor()
    cursor.execute('SELECT id FROM departments WHERE name=%s', (name,))
    row = cursor.fetchone()
    if row:
        cursor.close()
        return row[0]
    code = name[:5].upper().replace(' ', '')
    cursor.execute('INSERT INTO departments (name, code) VALUES (%s, %s)', (name, code))
    analytics_conn.commit()
    dept_id = cursor.lastrowid
    cursor.close()
    log.info(f"Created department: {name} (id={dept_id})")
    return dept_id

def upsert_production(analytics_conn, dept_id: int, data: dict):
    cursor = analytics_conn.cursor()
    sql = """
        INSERT INTO production_orders
            (department_id, order_date, total_orders, completed_orders,
             remaining_orders, active_cards, efficiency)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            total_orders=VALUES(total_orders),
            completed_orders=VALUES(completed_orders),
            remaining_orders=VALUES(remaining_orders),
            active_cards=VALUES(active_cards),
            efficiency=VALUES(efficiency),
            updated_at=NOW()
    """
    cursor.execute(sql, (
        dept_id,
        str(date.today()),
        data.get('total_orders', 0),
        data.get('completed_orders', 0),
        data.get('remaining_orders', 0),
        data.get('active_cards', 0),
        data.get('efficiency', 0),
    ))
    analytics_conn.commit()
    cursor.close()

def run_etl():
    log.info("Production ETL started")
    try:
        prod_conn      = get_prod_conn()
        analytics_conn = get_analytics_conn()

        rows = fetch_production_data(prod_conn)
        log.info(f"Fetched {len(rows)} department rows from production DB")

        for row in rows:
            dept_id = get_or_create_dept(analytics_conn, row['department_name'])
            upsert_production(analytics_conn, dept_id, row)

        prod_conn.close()
        analytics_conn.close()
        log.info("Production ETL completed successfully")
    except Exception as e:
        log.error(f"Production ETL failed: {e}")
        raise

if __name__ == '__main__':
    run_etl()
