import os
import sys
from collections import defaultdict
from datetime import date, timedelta
import psycopg
from etl.common.db import connect

QC_DSN = os.environ.get("QC_DATABASE_URL")

READ_SQL = """
  SELECT date::date AS d, sku, reason, category, qty
  FROM entries
  WHERE date BETWEEN %s AND %s
"""


def aggregate(rows):
    agg = defaultdict(int)
    for r in rows:
        key = (str(r["d"]), r["sku"], r["reason"], r.get("category"))
        agg[key] += int(r["qty"] or 0)
    return agg


def read_entries(start, end):
    with psycopg.connect(QC_DSN) as conn, conn.cursor() as cur:
        cur.execute(READ_SQL, (start, end))
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def write(agg):
    with connect() as conn, conn.cursor() as cur:
        for d in {k[0] for k in agg}:
            cur.execute("DELETE FROM qc_defects WHERE stat_date = %s", (d,))
        for (d, sku, reason, category), qty in agg.items():
            cur.execute(
                "INSERT INTO qc_defects (stat_date, sku, reason, category, qty) VALUES (%s,%s,%s,%s,%s)",
                (d, sku, reason, category, qty),
            )
        totals = defaultdict(int)
        for (d, _sku, _r, _c), qty in agg.items():
            totals[d] += qty
        for d, total in totals.items():
            cur.execute(
                "INSERT INTO qc_stats (stat_date, total_defects) VALUES (%s,%s) "
                "ON CONFLICT (stat_date) DO UPDATE SET total_defects=EXCLUDED.total_defects, updated_at=now()",
                (d, total),
            )
        conn.commit()


def run(start=None, end=None):
    if not QC_DSN:
        print("FATAL: QC_DATABASE_URL missing", file=sys.stderr)
        sys.exit(1)
    end = end or date.today()
    start = start or (end - timedelta(days=60))
    rows = read_entries(start, end)
    agg = aggregate(rows)
    write(agg)
    print(f"qc.py: {len(rows)} entries -> {len(agg)} defect rows, window {start}..{end}")


if __name__ == "__main__":
    run()
