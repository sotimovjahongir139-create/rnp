from datetime import date
from etl.common.db import connect

# thresholds mirror backend/src/config/constants.js KPI_THRESHOLDS
EFF_WARN, MISSED_WARN = 70, 10

def run(d=None):
    d = d or date.today()
    month_start = d.replace(day=1)
    with connect() as conn, conn.cursor() as cur:
        rows = []
        cur.execute("SELECT COALESCE(SUM(qty_done),0), COALESCE(SUM(qty_in),0) FROM production_stats WHERE stat_date >= current_date - 30")
        done, total = cur.fetchone()
        eff = round(done / total * 100, 1) if total else 0
        rows.append(('monthly', month_start, '', 'production_efficiency', eff, 'ok' if eff >= EFF_WARN else 'warn'))
        cur.execute("SELECT COALESCE(missed_clients,0) FROM call_stats WHERE period_type='monthly' ORDER BY period_date DESC LIMIT 1")
        mc = cur.fetchone(); missed = mc[0] if mc else 0
        rows.append(('monthly', month_start, '', 'missed_calls', missed, 'ok' if missed <= MISSED_WARN else 'warn'))
        cur.execute("SELECT COALESCE(response_rate,0) FROM telegram_stats ORDER BY report_date DESC LIMIT 1")
        tr = cur.fetchone(); resp = float(tr[0]) if tr else 0
        rows.append(('daily', d, '', 'telegram_response_rate', resp, 'ok' if resp >= 90 else 'warn'))
        for r in rows:
            cur.execute("""INSERT INTO kpi_results (period_type,period_date,department,metric,value,status)
              VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (period_type,period_date,department,metric)
              DO UPDATE SET value=EXCLUDED.value, status=EXCLUDED.status, updated_at=now()""", r)
        conn.commit()
    print(f"kpi_rollup.py: wrote {len(rows)} kpi rows for {d}")

if __name__ == "__main__":
    run()
