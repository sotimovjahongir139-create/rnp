import sys
from datetime import datetime, timedelta, timezone
from etl.common.amo import safe_get, find_user_ids, require_creds
from etl.common.db import connect

TARGET_MANAGERS = ["Asadbek"]
TZ = timezone(timedelta(hours=5))
HOUR_SLOTS = [("09:00-11:00",9,11),("11:00-13:00",11,13),("13:00-15:00",13,15),
              ("15:00-17:00",15,17),("17:00-19:00",17,19),("19:00-21:00",19,21),("21:00-23:00",21,23)]

def to_ts(dt): return int(dt.replace(tzinfo=TZ).timestamp())
def from_ts(ts): return datetime.fromtimestamp(ts, tz=TZ).replace(tzinfo=None)

def fetch_events(target_ids, start_ts, end_ts):
    events = []
    for etype in ["incoming_call", "outgoing_call"]:
        page = 1
        while True:
            params = {"filter[created_at][from]": start_ts, "filter[created_at][to]": end_ts,
                      "filter[type]": etype, "limit": 100, "page": page}
            r = safe_get("/events", params=params)
            if r.status_code == 204 or not r.ok: break
            data = r.json(); items = data.get("_embedded", {}).get("events", [])
            if not items: break
            events.extend([e for e in items if e.get("created_by") in target_ids])
            if "next" not in data.get("_links", {}): break
            page += 1
    return events

def fetch_notes(note_ids):
    notes = {}; unique = list(set(note_ids))
    for i in range(0, len(unique), 50):
        batch = unique[i:i+50]
        for entity in ["contacts", "leads"]:
            params = {"limit": 50}
            for j, nid in enumerate(batch): params[f"filter[id][{j}]"] = nid
            r = safe_get(f"/{entity}/notes", params=params)
            if r.ok and r.status_code != 204:
                for note in r.json().get("_embedded", {}).get("notes", []):
                    if note.get("id"): notes[note["id"]] = note.get("params", {}) or {}
                if any(nid in notes for nid in batch): break
    return notes

def build_records(events, notes):
    records = []
    for e in sorted(events, key=lambda x: x.get("created_at", 0)):
        cid = e.get("entity_id")
        if not cid: continue
        note_id = None
        for va in e.get("value_after", []):
            note_id = va.get("note", {}).get("id")
            if note_id: break
        p = notes.get(note_id, {}) if note_id else {}
        direction = p.get("direction") or ("inbound" if e.get("type") == "incoming_call" else "outbound")
        records.append({"direction": direction, "duration": p.get("duration", -1),
                        "contact_id": cid, "created_at": e.get("created_at", 0)})
    return records

def calc(records):
    hours = {label: 0 for label, _, _ in HOUR_SLOTS}
    missed_time, missed, recld, gaps = {}, set(), set(), []
    in_a = out_a = 0
    def slot(ts):
        h = from_ts(ts).hour
        for label, sh, eh in HOUR_SLOTS:
            if sh <= h < eh: hours[label] += 1; break
    for r in sorted(records, key=lambda x: x["created_at"]):
        cid, d, dur, ts = r["contact_id"], r["direction"], r["duration"], r["created_at"]
        if d == "inbound":
            if dur in (0, -1):
                missed.add(cid); missed_time.setdefault(cid, ts); slot(ts)
            elif dur > 0:
                in_a += 1; slot(ts)
        elif d == "outbound" and dur > 0:
            out_a += 1; slot(ts)
            if cid in missed:
                recld.add(cid)
                if cid in missed_time: gaps.append((ts - missed_time[cid]) / 60)
    m, rc = len(missed), len(recld)
    nrc = len(missed - recld); total = in_a + out_a + m
    return {"total": total, "incoming": in_a, "outgoing": out_a, "missed": m,
            "recalled": rc, "not_recalled": nrc,
            "answer_rate": round((in_a + out_a) / total * 100) if total else 0,
            "recall_rate": round(rc / m * 100) if m else 0,
            "no_recall_pct": (100 - round(rc / m * 100)) if m else 0,
            "avg_recall_minutes": round(sum(gaps) / len(gaps), 1) if gaps else 0.0,
            "hours": hours}

def hv(s, l): return s["hours"].get(l, 0)

def upsert(period_type, period_date, manager, s):
    cols = (period_type, period_date, manager, s["total"], s["incoming"], s["outgoing"],
            s["missed"], s["recalled"], s["not_recalled"], s["answer_rate"], s["recall_rate"],
            s["no_recall_pct"], s["avg_recall_minutes"],
            hv(s,"09:00-11:00"),hv(s,"11:00-13:00"),hv(s,"13:00-15:00"),hv(s,"15:00-17:00"),
            hv(s,"17:00-19:00"),hv(s,"19:00-21:00"),hv(s,"21:00-23:00"))
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
          INSERT INTO call_stats (period_type,period_date,manager_name,total_calls,incoming_answered,
            outgoing_answered,missed_clients,recalled_clients,not_recalled_clients,answer_rate,recall_rate,
            no_recall_pct,avg_recall_minutes,h_09_11,h_11_13,h_13_15,h_15_17,h_17_19,h_19_21,h_21_23)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
          ON CONFLICT (period_type,period_date,manager_name) DO UPDATE SET
            total_calls=EXCLUDED.total_calls, incoming_answered=EXCLUDED.incoming_answered,
            outgoing_answered=EXCLUDED.outgoing_answered, missed_clients=EXCLUDED.missed_clients,
            recalled_clients=EXCLUDED.recalled_clients, not_recalled_clients=EXCLUDED.not_recalled_clients,
            answer_rate=EXCLUDED.answer_rate, recall_rate=EXCLUDED.recall_rate, no_recall_pct=EXCLUDED.no_recall_pct,
            avg_recall_minutes=EXCLUDED.avg_recall_minutes, h_09_11=EXCLUDED.h_09_11, h_11_13=EXCLUDED.h_11_13,
            h_13_15=EXCLUDED.h_13_15, h_15_17=EXCLUDED.h_15_17, h_17_19=EXCLUDED.h_17_19,
            h_19_21=EXCLUDED.h_19_21, h_21_23=EXCLUDED.h_21_23, updated_at=now()
        """, cols)
        conn.commit()

def run():
    require_creds()
    target_ids = find_user_ids(TARGET_MANAGERS)
    if not target_ids:
        print("FATAL: manager 'Asadbek' not found", file=sys.stderr); sys.exit(1)
    manager = list(target_ids.values())[0]
    now = datetime.now(); yesterday = now - timedelta(days=1)
    day_start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = yesterday.replace(hour=23, minute=59, second=59, microsecond=0)
    month_start = day_start.replace(day=1)
    events = fetch_events(target_ids, to_ts(month_start), to_ts(day_end))
    note_ids = [va.get("note", {}).get("id") for e in events for va in e.get("value_after", []) if va.get("note", {}).get("id")]
    records = build_records(events, fetch_notes(note_ids))
    m_stats = calc(records)
    d_recs = [x for x in records if to_ts(day_start) <= x["created_at"] <= to_ts(day_end)]
    d_stats = calc(d_recs)
    upsert("monthly", month_start.date(), manager, m_stats)
    upsert("daily", yesterday.date(), manager, d_stats)
    print(f"amo_calls.py: {manager} monthly total={m_stats['total']} daily total={d_stats['total']}")

if __name__ == "__main__":
    run()
