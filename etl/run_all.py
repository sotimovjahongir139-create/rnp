import sys, traceback
# production.py added in Phase 3
from etl import qc, amo_calls, amo_telegram, kpi_rollup

JOBS = [("qc", qc.run), ("amo_calls", amo_calls.run),
        ("amo_telegram", amo_telegram.run), ("kpi_rollup", kpi_rollup.run)]

def main():
    failures = []
    for name, fn in JOBS:
        try:
            print(f"=== {name} ==="); fn()
        except SystemExit as e:
            if e.code: failures.append(name); print(f"!! {name} exited {e.code}", file=sys.stderr)
        except Exception:
            failures.append(name); print(f"!! {name} failed:\n{traceback.format_exc()}", file=sys.stderr)
    if failures:
        print(f"DONE with failures: {failures}", file=sys.stderr); sys.exit(1)
    print("DONE: all jobs ok")

if __name__ == "__main__":
    main()
