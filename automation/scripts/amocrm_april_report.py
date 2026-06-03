import os
import requests
import sys
import time
import mysql.connector
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone

load_dotenv()

AMOCRM_DOMAIN   = os.getenv("AMOCRM_DOMAIN")
AMOCRM_TOKEN    = os.getenv("AMOCRM_TOKEN")
TARGET_MANAGERS = ["Asadbek"]

if not AMOCRM_DOMAIN or not AMOCRM_TOKEN:
    print("XATO: .env da AMOCRM_DOMAIN yoki AMOCRM_TOKEN topilmadi.")
    sys.exit(1)

TZ = timezone(timedelta(hours=5))

def to_ts(dt):
    return int(dt.replace(tzinfo=TZ).timestamp())

def from_ts(ts):
    return datetime.fromtimestamp(ts, tz=TZ).replace(tzinfo=None)

now = datetime.now()

if len(sys.argv) > 1:
    try:
        report_day = datetime.strptime(sys.argv[1], "%Y-%m-%d")
        print(f"Manual sana: {report_day.strftime('%d.%m.%Y')}")
    except ValueError:
        print("Sana formati xato. Misol: python amocrm_april_report.py 2026-06-02")
        sys.exit(1)
else:
    report_day = now - timedelta(days=1)

DAY_START   = report_day.replace(hour=0,  minute=0,  second=0,  microsecond=0)
DAY_END     = report_day.replace(hour=23, minute=59, second=59, microsecond=0)
MONTH_START = DAY_START.replace(day=1)
MONTH_END   = DAY_END

STAT_DATE   = report_day.date()
STAT_MONTH  = MONTH_START.date()

BASE_URL    = f"https://{AMOCRM_DOMAIN}"
HEADERS     = {"Authorization": f"Bearer {AMOCRM_TOKEN}"}
TIMEOUT     = 60
RETRIES     = 3
RETRY_DELAY = 5

HOUR_SLOTS = [
    ("09:00-11:00", 9,  11),
    ("11:00-13:00", 11, 13),
    ("13:00-15:00", 13, 15),
    ("15:00-17:00", 15, 17),
    ("17:00-19:00", 17, 19),
    ("19:00-21:00", 19, 21),
    ("21:00-23:00", 21, 23),
]

SLOT_LABEL = {
    "09:00-11:00": "09-11",
    "11:00-13:00": "11-13",
    "13:00-15:00": "13-15",
    "15:00-17:00": "15-17",
    "17:00-19:00": "17-19",
    "19:00-21:00": "19-21",
    "21:00-23:00": "21-23",
}

def _mysql_conn():
    return mysql.connector.connect(
        host=os.getenv("ANALYTICS_DB_HOST", "localhost"),
        port=int(os.getenv("ANALYTICS_DB_PORT", 3306)),
        user=os.getenv("ANALYTICS_DB_USER"),
        password=os.getenv("ANALYTICS_DB_PASS"),
        database=os.getenv("ANALYTICS_DB_NAME", "rnp_analytics"),
    )

def safe_get(url, params=None):
    for attempt in range(1, RETRIES + 1):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=TIMEOUT)
            return r
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError) as e:
            print(f"   Ulanish xatosi ({attempt}/{RETRIES}): {e}")
            if attempt < RETRIES:
                time.sleep(RETRY_DELAY)
    raise Exception("Barcha urinishlar muvaffaqiyatsiz!")


def get_target_ids():
    r = safe_get(f"{BASE_URL}/api/v4/users")
    if r.status_code == 401:
        print("XATO: Token noto'g'ri.")
        sys.exit(1)
    ids = {}
    for u in r.json().get("_embedded", {}).get("users", []):
        name = u.get("name", "")
        for t in TARGET_MANAGERS:
            if t.lower() in name.lower():
                ids[u["id"]] = name
    return ids


def fetch_events(target_ids):
    start_ts = to_ts(MONTH_START)
    end_ts   = to_ts(MONTH_END)
    events   = []

    print(f"   Lokal: {MONTH_START.strftime('%d.%m.%Y %H:%M')} -> {MONTH_END.strftime('%d.%m.%Y %H:%M')}")
    print(f"   UTC timestamp: {start_ts} -> {end_ts}")

    for etype in ["incoming_call", "outgoing_call"]:
        page = 1
        while True:
            params = {
                "filter[created_at][from]": start_ts,
                "filter[created_at][to]":   end_ts,
                "filter[type]":             etype,
                "limit": 100,
                "page":  page,
            }
            r = safe_get(f"{BASE_URL}/api/v4/events", params=params)

            if r.status_code == 204:
                break
            if not r.ok:
                print(f"   Event xato: {r.status_code}")
                break

            data  = r.json()
            items = data.get("_embedded", {}).get("events", [])
            if not items:
                break

            filtered = [e for e in items if e.get("created_by") in target_ids]
            events.extend(filtered)
            print(f"   {etype}: {len(events)} ta, sahifa {page}", end="\r")

            if "next" not in data.get("_links", {}):
                break
            page += 1

    print()
    return events


def fetch_notes(note_ids):
    notes  = {}
    unique = list(set(note_ids))
    if not unique:
        return notes

    for i in range(0, len(unique), 50):
        batch = unique[i:i+50]
        for entity in ["contacts", "leads"]:
            params = {"limit": 50}
            for j, nid in enumerate(batch):
                params[f"filter[id][{j}]"] = nid
            r = safe_get(f"{BASE_URL}/api/v4/{entity}/notes", params=params)
            if r.ok and r.status_code != 204:
                for note in r.json().get("_embedded", {}).get("notes", []):
                    nid = note.get("id")
                    if nid:
                        notes[nid] = note.get("params", {}) or {}
                if any(nid in notes for nid in batch):
                    break
        print(f"   Notes: {len(notes)}/{len(unique)}", end="\r")

    print()
    return notes


def build_records(events, notes):
    records = []
    for e in sorted(events, key=lambda x: x.get("created_at", 0)):
        etype      = e.get("type", "")
        contact_id = e.get("entity_id")
        created_at = e.get("created_at", 0)
        if not contact_id:
            continue

        note_id = None
        for va in e.get("value_after", []):
            note_id = va.get("note", {}).get("id")
            if note_id:
                break

        p         = notes.get(note_id, {}) if note_id else {}
        duration  = p.get("duration", -1)
        direction = p.get("direction", "")
        if not direction:
            direction = "inbound" if etype == "incoming_call" else "outbound"

        records.append({
            "direction":  direction,
            "duration":   duration,
            "contact_id": contact_id,
            "created_at": created_at,
        })
    return records


def calc(records):
    hours       = {label: 0 for label, _, _ in HOUR_SLOTS}
    missed_time = {}
    missed      = set()
    recld       = set()
    recall_gaps = []
    in_a        = 0
    out_a       = 0

    for r in sorted(records, key=lambda x: x["created_at"]):
        cid = r["contact_id"]
        d   = r["direction"]
        dur = r["duration"]
        ts  = r["created_at"]

        if d == "inbound":
            if dur == 0 or dur == -1:
                missed.add(cid)
                if cid not in missed_time:
                    missed_time[cid] = ts
                h = from_ts(ts).hour
                for label, sh, eh in HOUR_SLOTS:
                    if sh <= h < eh:
                        hours[label] += 1
                        break
            elif dur > 0:
                in_a += 1
                h = from_ts(ts).hour
                for label, sh, eh in HOUR_SLOTS:
                    if sh <= h < eh:
                        hours[label] += 1
                        break

        elif d == "outbound" and dur > 0:
            out_a += 1
            h = from_ts(ts).hour
            for label, sh, eh in HOUR_SLOTS:
                if sh <= h < eh:
                    hours[label] += 1
                    break
            if cid in missed:
                recld.add(cid)
                if cid in missed_time:
                    gap_min = (ts - missed_time[cid]) / 60
                    recall_gaps.append(gap_min)

    m     = len(missed)
    rc    = len(recld)
    nrc   = len(missed - recld)
    total = in_a + out_a + m
    ans   = round((in_a + out_a) / total * 100) if total else 0
    rec   = round(rc / m * 100) if m else 0
    avg_recall = round(sum(recall_gaps) / len(recall_gaps), 1) if recall_gaps else 0.0

    return {
        "total": total, "incoming": in_a, "outgoing": out_a,
        "missed": m, "recalled": rc, "not_recalled": nrc,
        "answer_rate": ans, "recall_rate": rec,
        "avg_recall_minutes": avg_recall,
        "hours": hours,
    }


def day_records(records, day_local):
    s = to_ts(day_local.replace(hour=0,  minute=0,  second=0,  microsecond=0))
    e = to_ts(day_local.replace(hour=23, minute=59, second=59, microsecond=0))
    r = [x for x in records if s <= x["created_at"] <= e]
    print(f"   Kunlik ({day_local.date()}): {len(r)} ta record | UTC {s}->{e}")
    return r


def save_monthly(stat_month, manager, s):
    conn = _mysql_conn()
    cur  = conn.cursor()
    cur.execute(
        "DELETE FROM amo_call_monthly_stats WHERE stat_month=%s AND manager_name=%s",
        (stat_month, manager)
    )
    cur.execute("""
        INSERT INTO amo_call_monthly_stats
            (stat_month, manager_name, total_calls, incoming_calls, outgoing_calls,
             missed_calls, recalled_calls, not_recalled, answer_rate, recall_rate,
             avg_recall_minutes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        stat_month, manager,
        s["total"], s["incoming"], s["outgoing"],
        s["missed"], s["recalled"], s["not_recalled"],
        s["answer_rate"], s["recall_rate"],
        s["avg_recall_minutes"],
    ))
    conn.commit()
    cur.close()
    conn.close()
    print(f"   OK monthly -> {stat_month} | {manager} | avg_recall={s['avg_recall_minutes']} daq")


def save_daily(stat_date, manager, s):
    conn = _mysql_conn()
    cur  = conn.cursor()

    # Daily summary
    cur.execute(
        "DELETE FROM amo_call_daily_stats WHERE stat_date=%s AND manager_name=%s",
        (stat_date, manager)
    )
    cur.execute("""
        INSERT INTO amo_call_daily_stats
            (stat_date, manager_name, total_calls, incoming_calls, outgoing_calls,
             missed_calls, recalled_calls, not_recalled, answer_rate, recall_rate,
             avg_recall_minutes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        stat_date, manager,
        s["total"], s["incoming"], s["outgoing"],
        s["missed"], s["recalled"], s["not_recalled"],
        s["answer_rate"], s["recall_rate"],
        s["avg_recall_minutes"],
    ))

    # Hourly breakdown → crm_hourly_stats
    cur.execute("DELETE FROM crm_hourly_stats WHERE stat_date=%s", (stat_date,))
    for slot_key, slot_label in SLOT_LABEL.items():
        count = s["hours"].get(slot_key, 0)
        cur.execute(
            "INSERT INTO crm_hourly_stats (stat_date, hour_slot, call_count) VALUES (%s, %s, %s)",
            (stat_date, slot_label, count)
        )

    conn.commit()
    cur.close()
    conn.close()
    print(f"   OK daily   -> {stat_date} | {manager} | avg_recall={s['avg_recall_minutes']} daq")


def bar(v, mx, w=20):
    f = round(v/mx*w) if mx else 0
    return "X"*f + "."*(w-f)


def print_stats(title, s):
    print("\n" + "="*65)
    print(f"  {title}")
    print("="*65)
    print(f"  Jami                    : {s['total']}")
    print(f"  Kiruvchi                : {s['incoming']}")
    print(f"  Chiquvchi               : {s['outgoing']}")
    print(f"  Propushen               : {s['missed']}")
    print(f"  Qayta chiqilgan         : {s['recalled']}")
    print(f"  Qayta chiqilmagan       : {s['not_recalled']}")
    print(f"  Javob berish %          : {s['answer_rate']}%")
    print(f"  Qayta chiqish %         : {s['recall_rate']}%")
    print(f"  O'rtacha qayta aloqa    : {s['avg_recall_minutes']} daqiqa")
    print("-"*65)
    mx = max(s["hours"].values()) if s["hours"] else 1
    for label, v in s["hours"].items():
        print(f"  {label}  {bar(v,mx)}  {v}")
    print("="*65)


def main():
    print("="*65)
    print("  AMOCRM CALL ETL — " + now.strftime("%d.%m.%Y %H:%M"))
    print(f"  Fayl: {os.path.abspath(__file__)}")
    print("="*65)
    print(f"  Oylik : {MONTH_START.strftime('%d.%m.%Y')} -> {MONTH_END.strftime('%d.%m.%Y')}")
    print(f"  Kunlik: {STAT_DATE} (kecha)")
    print("="*65)

    print("\n[1] Menejerlar...")
    target_ids = get_target_ids()
    if not target_ids:
        print("XATO: Menejer topilmadi!")
        sys.exit(1)
    for uid, name in target_ids.items():
        print(f"   {name} (ID: {uid})")
    manager = list(target_ids.values())[0]

    print("\n[2] Eventlar olinmoqda...")
    events = fetch_events(target_ids)
    print(f"   Jami {len(events)} ta event")

    note_ids = []
    for e in events:
        for va in e.get("value_after", []):
            nid = va.get("note", {}).get("id")
            if nid:
                note_ids.append(nid)
    print(f"\n[3] {len(note_ids)} ta note olinmoqda...")
    notes = fetch_notes(note_ids)
    print(f"   {len(notes)} ta note olindi")

    records = build_records(events, notes)
    print(f"\n[4] {len(records)} ta xom record")

    print("\n[5] Hisob-kitob...")
    m_stats = calc(records)
    d_recs  = day_records(records, DAY_START)
    d_stats = calc(d_recs)

    print_stats(f"OYLIK | {MONTH_START.strftime('%d.%m')} - {MONTH_END.strftime('%d.%m.%Y')} | {manager}", m_stats)
    print_stats(f"KUNLIK | {STAT_DATE} | {manager}", d_stats)

    print("\n[6] MySQL ga saqlanmoqda...")
    save_monthly(STAT_MONTH, manager, m_stats)
    save_daily(STAT_DATE, manager, d_stats)

    print("\nTAYYOR!\n")


if __name__ == "__main__":
    main()
