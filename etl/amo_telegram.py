import sys, time
from datetime import datetime, timedelta
from collections import defaultdict
from etl.common.amo import safe_get, require_creds
from etl.common.db import connect

TELEGRAM_ORIGIN = "ru.whatcrm.telegram"

def extract_message_info(event):
    for item in event.get("value_after", []) or []:
        msg = item.get("message")
        if msg:
            return {"message_id": msg.get("id"), "origin": msg.get("origin"), "talk_id": msg.get("talk_id")}
    return {"message_id": None, "origin": None, "talk_id": None}

def fetch_chat_events(ts_from, ts_to):
    all_events = []
    for etype in ["incoming_chat_message", "outgoing_chat_message"]:
        page = 1
        while True:
            params = {"limit": 250, "page": page, "filter[created_at][from]": ts_from,
                      "filter[created_at][to]": ts_to, "filter[type]": etype}
            r = safe_get("/events", params=params)
            if not r or r.status_code == 204 or r.status_code != 200: break
            data = r.json(); items = data.get("_embedded", {}).get("events", [])
            if not items: break
            for e in items:
                msg = extract_message_info(e)
                if msg["origin"] != TELEGRAM_ORIGIN: continue
                tcid = (e.get("_embedded", {}).get("entity", {}).get("linked_talk_contact_id"))
                all_events.append({"type": e.get("type"), "lead_id": e.get("entity_id"),
                                   "created_at": e.get("created_at"), "talk_id": msg["talk_id"],
                                   "linked_talk_contact_id": tcid})
            if "next" not in data.get("_links", {}): break
            page += 1; time.sleep(0.1)
    return all_events

def fetch_lead_info_map(lead_ids):
    lead_ids = list({x for x in lead_ids if x}); result = {}
    for i in range(0, len(lead_ids), 50):
        batch = lead_ids[i:i+50]; params = {"limit": 50, "with": "contacts"}
        for j, lid in enumerate(batch): params[f"filter[id][{j}]"] = lid
        r = safe_get("/leads", params=params)
        if not r or r.status_code != 200: continue
        for lead in r.json().get("_embedded", {}).get("leads", []):
            contacts = lead.get("_embedded", {}).get("contacts", []) or []
            result[lead.get("id")] = {"contact_id": contacts[0].get("id") if contacts else None}
        time.sleep(0.1)
    for lid in lead_ids: result.setdefault(lid, {"contact_id": None})
    return result

def event_side(t): return "CLIENT" if t == "incoming_chat_message" else "MANAGER" if t == "outgoing_chat_message" else "UNKNOWN"

def build_turns(events):
    turns = []
    for e in sorted(events, key=lambda x: x["created_at"]):
        side = event_side(e["type"])
        if side == "UNKNOWN": continue
        if not turns or turns[-1]["side"] != side:
            turns.append({"side": side, "start_ts": e["created_at"], "end_ts": e["created_at"], "count": 1,
                          "lead_id": e.get("lead_id"), "contact_id": e.get("contact_id"), "talk_id": e.get("talk_id")})
        else:
            turns[-1]["end_ts"] = e["created_at"]; turns[-1]["count"] += 1
    return turns

def analyze_conversation(group_key, events):
    rows, minutes = [], []; turns = build_turns(events)
    for idx, turn in enumerate(turns):
        if turn["side"] != "CLIENT": continue
        nxt = next((t for t in turns[idx+1:] if t["side"] == "MANAGER"), None)
        client_time = datetime.fromtimestamp(turn["end_ts"])
        if nxt:
            diff = (nxt["start_ts"] - turn["end_ts"]) / 60
            if diff < 0: continue
            rows.append({"contact_id": turn["contact_id"], "lead_id": turn["lead_id"], "talk_id": turn["talk_id"],
                         "client_time": client_time, "manager_reply_time": datetime.fromtimestamp(nxt["start_ts"]),
                         "response_minutes": diff, "status": "ANSWERED"})
            minutes.append(diff)
        else:
            rows.append({"contact_id": turn["contact_id"], "lead_id": turn["lead_id"], "talk_id": turn["talk_id"],
                         "client_time": client_time, "manager_reply_time": None, "response_minutes": None, "status": "WAITING"})
    return rows, minutes

def write(report_date, summary, detail_rows):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM telegram_response_details WHERE report_date=%s", (report_date,))
        cur.execute("""
          INSERT INTO telegram_stats (report_date,unique_contacts,unique_talks,unique_leads,total_events,
            client_messages,manager_messages,client_turns,answered_turns,waiting_turns,response_rate,
            avg_response_minutes,median_response_minutes)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
          ON CONFLICT (report_date) DO UPDATE SET unique_contacts=EXCLUDED.unique_contacts,
            unique_talks=EXCLUDED.unique_talks, unique_leads=EXCLUDED.unique_leads, total_events=EXCLUDED.total_events,
            client_messages=EXCLUDED.client_messages, manager_messages=EXCLUDED.manager_messages,
            client_turns=EXCLUDED.client_turns, answered_turns=EXCLUDED.answered_turns,
            waiting_turns=EXCLUDED.waiting_turns, response_rate=EXCLUDED.response_rate,
            avg_response_minutes=EXCLUDED.avg_response_minutes, median_response_minutes=EXCLUDED.median_response_minutes,
            updated_at=now()
        """, (report_date, summary["unique_contacts"], summary["unique_talks"], summary["unique_leads"],
              summary["total_events"], summary["client_messages"], summary["manager_messages"],
              summary["client_turns"], summary["answered_turns"], summary["waiting_turns"],
              summary["response_rate"], summary["avg_response_minutes"], summary["median_response_minutes"]))
        for r in detail_rows:
            cur.execute("""INSERT INTO telegram_response_details (report_date,contact_id,lead_id,talk_id,
              client_time,manager_reply_time,response_minutes,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
              (report_date, r["contact_id"], r["lead_id"], r["talk_id"], r["client_time"],
               r["manager_reply_time"], r["response_minutes"], r["status"]))
        conn.commit()

def run(report_day=None):
    require_creds()
    report_day = report_day or (datetime.now() - timedelta(days=1))
    day_start = report_day.replace(hour=0, minute=0, second=0, microsecond=0)
    ts_from, ts_to = int(day_start.timestamp()), int((day_start + timedelta(days=1)).timestamp())
    events = fetch_chat_events(ts_from, ts_to)
    if not events:
        write(day_start.date(), {k: 0 for k in ["unique_contacts","unique_talks","unique_leads","total_events",
            "client_messages","manager_messages","client_turns","answered_turns","waiting_turns","response_rate"]}
            | {"avg_response_minutes": None, "median_response_minutes": None}, [])
        print("amo_telegram.py: no events"); return
    lead_map = fetch_lead_info_map([e["lead_id"] for e in events if e["lead_id"]])
    for e in events:
        e["contact_id"] = lead_map.get(e["lead_id"], {}).get("contact_id") or e.get("linked_talk_contact_id")
    incoming = sum(1 for e in events if e["type"] == "incoming_chat_message")
    outgoing = sum(1 for e in events if e["type"] == "outgoing_chat_message")
    grouped = defaultdict(list)
    for e in events: grouped[e["talk_id"] or e["contact_id"] or e["lead_id"]].append(e)
    all_rows, all_min = [], []
    for k, evs in grouped.items():
        rows, mins = analyze_conversation(k, evs); all_rows += rows; all_min += mins
    answered = sum(1 for r in all_rows if r["status"] == "ANSWERED")
    waiting = sum(1 for r in all_rows if r["status"] == "WAITING")
    client_turns = answered + waiting
    sm = sorted(all_min); med = (sm[len(sm)//2] if len(sm) % 2 else (sm[len(sm)//2-1]+sm[len(sm)//2])/2) if sm else None
    summary = {"unique_contacts": len({e["contact_id"] for e in events if e["contact_id"]}),
               "unique_talks": len({e["talk_id"] for e in events if e["talk_id"]}),
               "unique_leads": len({e["lead_id"] for e in events if e["lead_id"]}),
               "total_events": len(events), "client_messages": incoming, "manager_messages": outgoing,
               "client_turns": client_turns, "answered_turns": answered, "waiting_turns": waiting,
               "response_rate": round(answered/client_turns*100, 2) if client_turns else 0,
               "avg_response_minutes": round(sum(all_min)/len(all_min), 2) if all_min else None,
               "median_response_minutes": round(med, 2) if med is not None else None}
    write(day_start.date(), summary, all_rows)
    print(f"amo_telegram.py: events={summary['total_events']} answered={answered} waiting={waiting}")

if __name__ == "__main__":
    day = datetime.strptime(sys.argv[1], "%Y-%m-%d") if len(sys.argv) > 1 else None
    run(day)
