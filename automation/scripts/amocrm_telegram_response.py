import sys
import os
import time
from datetime import datetime, timedelta
from collections import defaultdict

import requests
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# CONFIG
# ============================================================

ACCESS_TOKEN = os.getenv("AMOCRM_ACCESS_TOKEN", "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImRlZjFlYzNlNDk4NWI5MDJhNDAzMjRkYzc0Zjg4YjhhZjBmYjhhOWM4MzQwNDZjNjUwOWQ3ZTVkNTMyYWJjNjdkMjkxYjM5OGIzMDJkNDU0In0.eyJhdWQiOiI2N2YyNzFkMi02M2MyLTQ3YWMtOWRlNS0zNzQzMGQxZjU5MWUiLCJqdGkiOiJkZWYxZWMzZTQ5ODViOTAyYTQwMzI0ZGM3NGY4OGI4YWYwZmI4YTljODM0MDQ2YzY1MDlkN2U1ZDUzMmFiYzY3ZDI5MWIzOThiMzAyZDQ1NCIsImlhdCI6MTc3NjY3NzA0OCwibmJmIjoxNzc2Njc3MDQ4LCJleHAiOjE5MzQ0MDk2MDAsInN1YiI6IjEwODkxNjk4IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjMxNjc3Njc4LCJiYXNlX2RvbWFpbiI6ImFtb2NybS5ydSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiOTFkMzg1ODYtYjg2Ny00ODRhLWI1MGEtYzg0MTkzYTU4ZmZlIiwiYXBpX2RvbWFpbiI6ImFwaS1iLmFtb2NybS5ydSJ9.IQc6Vtl3kXI5yzT5zz1U10upheu7VHMU1zH_iTaspbfOHPEHGbQAjkX3ARXnF9IRb_udoemxyBslFSlPAgcNqZf06xDHWiIpd7z36gu4TmVJSxVcVvKT-mGrjnpMkehXE1b7yV_hjOvr_TDkBsF-Sbv8DO95zD2ywO-jtFl4e12GBgzZ-xkKaGOd_PX6on5FKbIdeMFiXy-WaweuMYWPl5zSZYnUr7o_zQMJVqRqE3Fox-YFNI9Vsk74rBge3wLo6N1bir-QQxnGVA4OR116_4t8V0Qa8_iVEnlDlc17wzEBo7JrUgkXF8qh3lHTknmH-DSjwmJ_teaLh9nzckxgcw")
SUBDOMAIN = "numbersarkon"

TARGET_MANAGER_NAME = "Perfect"
FILTER_BY_RESPONSIBLE_MANAGER = False

TELEGRAM_ORIGIN = "ru.whatcrm.telegram"

SAVE_TO_SQL = True
REPORT_NAME = "ALL_TELEGRAM"

BASE_URL = f"https://{SUBDOMAIN}.amocrm.ru/api/v4"
HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
}

TIMEOUT = 60
RETRIES = 3
RETRY_DELAY = 3


if len(sys.argv) > 1:
    try:
        report_day = datetime.strptime(sys.argv[1], "%Y-%m-%d")
        print(f"Manual sana: {report_day.strftime('%d.%m.%Y')}")
    except ValueError:
        print("Sana formati xato. Misol: python amocrm_telegram_response.py 2026-05-01")
        sys.exit(1)
else:
    report_day = datetime.now() - timedelta(days=1)

DAY_START = report_day.replace(hour=0, minute=0, second=0, microsecond=0)
DAY_END = DAY_START + timedelta(days=1)

TS_FROM = int(DAY_START.timestamp())
TS_TO = int(DAY_END.timestamp())


# ============================================================
# MySQL CONNECTION
# ============================================================

def _mysql_conn():
    return mysql.connector.connect(
        host=os.getenv("ANALYTICS_DB_HOST", "localhost"),
        port=int(os.getenv("ANALYTICS_DB_PORT", 3306)),
        user=os.getenv("ANALYTICS_DB_USER"),
        password=os.getenv("ANALYTICS_DB_PASS"),
        database=os.getenv("ANALYTICS_DB_NAME"),
    )


def ensure_tables():
    conn = _mysql_conn()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS telegram_daily_stats (
            report_date DATE NOT NULL,
            report_name VARCHAR(100) NOT NULL,

            unique_contacts INT NOT NULL,
            unique_talks INT NOT NULL,
            unique_leads INT NOT NULL,

            total_events INT NOT NULL,
            client_messages INT NOT NULL,
            manager_messages INT NOT NULL,

            client_turns INT NOT NULL,
            answered_turns INT NOT NULL,
            waiting_turns INT NOT NULL,

            response_rate FLOAT NOT NULL,
            avg_response_minutes FLOAT NULL,
            median_response_minutes FLOAT NULL,

            loaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

            PRIMARY KEY (report_date, report_name)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS telegram_response_details (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,

            report_date DATE NOT NULL,
            report_name VARCHAR(100) NOT NULL,

            contact_id BIGINT NULL,
            lead_id BIGINT NULL,
            talk_id BIGINT NULL,

            client_time DATETIME NULL,
            manager_reply_time DATETIME NULL,

            response_minutes FLOAT NULL,
            status VARCHAR(30) NOT NULL,

            client_messages_in_turn INT NULL,
            manager_messages_in_reply INT NULL,

            loaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    cursor.close()
    conn.close()


def save_to_sql(summary, detail_rows):
    ensure_tables()

    conn = _mysql_conn()
    cursor = conn.cursor()

    report_date = summary["report_date"]
    report_name = summary["report_name"]

    cursor.execute("""
        DELETE FROM telegram_response_details
        WHERE report_date = %s AND report_name = %s
    """, (report_date, report_name))

    cursor.execute("""
        DELETE FROM telegram_daily_stats
        WHERE report_date = %s AND report_name = %s
    """, (report_date, report_name))

    cursor.execute("""
        INSERT INTO telegram_daily_stats (
            report_date, report_name,
            unique_contacts, unique_talks, unique_leads,
            total_events, client_messages, manager_messages,
            client_turns, answered_turns, waiting_turns,
            response_rate, avg_response_minutes, median_response_minutes
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        summary["report_date"],
        summary["report_name"],
        summary["unique_contacts"],
        summary["unique_talks"],
        summary["unique_leads"],
        summary["total_events"],
        summary["client_messages"],
        summary["manager_messages"],
        summary["client_turns"],
        summary["answered_turns"],
        summary["waiting_turns"],
        summary["response_rate"],
        summary["avg_response_minutes"],
        summary["median_response_minutes"],
    ))

    for row in detail_rows:
        cursor.execute("""
            INSERT INTO telegram_response_details (
                report_date, report_name,
                contact_id, lead_id, talk_id,
                client_time, manager_reply_time,
                response_minutes, status,
                client_messages_in_turn, manager_messages_in_reply
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            row["report_date"],
            row["report_name"],
            row["contact_id"],
            row["lead_id"],
            row["talk_id"],
            row["client_time"],
            row["manager_reply_time"],
            row["response_minutes"],
            row["status"],
            row["client_messages_in_turn"],
            row["manager_messages_in_reply"],
        ))

    conn.commit()
    cursor.close()
    conn.close()
    print("MySQL saqlandi: telegram_daily_stats va telegram_response_details")


# ============================================================
# AmoCRM API
# ============================================================

def safe_get(url, params=None):
    for attempt in range(1, RETRIES + 1):
        try:
            return requests.get(url, headers=HEADERS, params=params, timeout=TIMEOUT)
        except requests.exceptions.RequestException as e:
            print(f"API xato: {e}. Urinish {attempt}/{RETRIES}")
            if attempt < RETRIES:
                time.sleep(RETRY_DELAY)
    return None


def get_manager_id_by_name(manager_name):
    r = safe_get(f"{BASE_URL}/users")
    if not r:
        print("Users API javob bermadi.")
        return None, None
    if r.status_code == 401:
        print("Token noto'g'ri yoki muddati o'tgan.")
        sys.exit(1)
    if r.status_code != 200:
        print(f"Users olishda xato: {r.status_code}")
        return None, None

    users = r.json().get("_embedded", {}).get("users", [])
    matches = [(u.get("id"), u.get("name", "")) for u in users
               if manager_name.lower() in u.get("name", "").lower()]

    if not matches:
        print(f"Manager topilmadi: {manager_name}")
        for u in users:
            print(f"  {u.get('name')} | ID: {u.get('id')}")
        return None, None

    if len(matches) > 1:
        print(f"Bir nechta manager topildi: {manager_name}. Birinchisi olinadi.")
    return matches[0]


def extract_message_info(event):
    for item in event.get("value_after", []) or []:
        msg = item.get("message")
        if msg:
            return {
                "message_id": msg.get("id"),
                "origin": msg.get("origin"),
                "talk_id": msg.get("talk_id"),
            }
    return {"message_id": None, "origin": None, "talk_id": None}


def fetch_chat_events():
    all_events = []
    for event_type in ["incoming_chat_message", "outgoing_chat_message"]:
        page = 1
        while True:
            params = {
                "limit": 250, "page": page,
                "filter[created_at][from]": TS_FROM,
                "filter[created_at][to]": TS_TO,
                "filter[type]": event_type,
            }
            r = safe_get(f"{BASE_URL}/events", params=params)
            if not r or r.status_code == 204:
                break
            if r.status_code != 200:
                print(f"Events olishda xato: {r.status_code}")
                break

            data = r.json()
            items = data.get("_embedded", {}).get("events", [])
            if not items:
                break

            for e in items:
                msg = extract_message_info(e)
                if msg["origin"] != TELEGRAM_ORIGIN:
                    continue
                try:
                    talk_contact_id = (
                        e.get("_embedded", {})
                         .get("entity", {})
                         .get("linked_talk_contact_id")
                    )
                except Exception:
                    talk_contact_id = None

                all_events.append({
                    "event_id": e.get("id"),
                    "type": e.get("type"),
                    "lead_id": e.get("entity_id"),
                    "entity_type": e.get("entity_type"),
                    "created_at": e.get("created_at"),
                    "created_by": e.get("created_by"),
                    "message_id": msg["message_id"],
                    "origin": msg["origin"],
                    "talk_id": msg["talk_id"],
                    "linked_talk_contact_id": talk_contact_id,
                })

            print(f"   {event_type}: page {page}, jami telegram events: {len(all_events)}", end="\r")
            if "next" not in data.get("_links", {}):
                break
            page += 1
            time.sleep(0.1)

    print()
    return all_events


def fetch_lead_info_map(lead_ids):
    lead_ids = list(set([x for x in lead_ids if x]))
    result = {}
    batch_size = 50

    for i in range(0, len(lead_ids), batch_size):
        batch = lead_ids[i:i + batch_size]
        params = {"limit": batch_size, "with": "contacts"}
        for j, lead_id in enumerate(batch):
            params[f"filter[id][{j}]"] = lead_id

        r = safe_get(f"{BASE_URL}/leads", params=params)
        if not r or r.status_code == 204:
            continue
        if r.status_code != 200:
            print(f"Lead info olishda xato: {r.status_code}")
            continue

        for lead in r.json().get("_embedded", {}).get("leads", []):
            lid = lead.get("id")
            contacts = lead.get("_embedded", {}).get("contacts", []) or []
            result[lid] = {
                "responsible_user_id": lead.get("responsible_user_id"),
                "contact_id": contacts[0].get("id") if contacts else None,
                "lead_name": lead.get("name"),
            }

        print(f"Lead info: {min(i+batch_size, len(lead_ids))}/{len(lead_ids)}", end="\r")
        time.sleep(0.1)

    print()
    for lead_id in lead_ids:
        result.setdefault(lead_id, {
            "responsible_user_id": None,
            "contact_id": None,
            "lead_name": None,
        })
    return result


# ============================================================
# Conversation analysis
# ============================================================

def event_side(event_type):
    if event_type == "incoming_chat_message": return "CLIENT"
    if event_type == "outgoing_chat_message": return "MANAGER"
    return "UNKNOWN"


def build_turns(events):
    turns = []
    for e in sorted(events, key=lambda x: x["created_at"]):
        side = event_side(e["type"])
        if side == "UNKNOWN":
            continue
        if not turns or turns[-1]["side"] != side:
            turns.append({
                "side": side,
                "start_ts": e["created_at"],
                "end_ts": e["created_at"],
                "count": 1,
                "lead_id": e["lead_id"],
                "contact_id": e["contact_id"],
                "talk_id": e["talk_id"],
            })
        else:
            turns[-1]["end_ts"] = e["created_at"]
            turns[-1]["count"] += 1
    return turns


def analyze_conversation(group_key, events):
    rows = []
    response_minutes = []
    turns = build_turns(events)

    for idx, turn in enumerate(turns):
        if turn["side"] != "CLIENT":
            continue

        next_manager_turn = None
        for nxt in turns[idx + 1:]:
            if nxt["side"] == "MANAGER":
                next_manager_turn = nxt
                break

        client_time = datetime.fromtimestamp(turn["end_ts"])

        if next_manager_turn:
            reply_time = datetime.fromtimestamp(next_manager_turn["start_ts"])
            diff_min = (next_manager_turn["start_ts"] - turn["end_ts"]) / 60
            if diff_min < 0:
                continue
            rows.append({
                "report_date": DAY_START.date(),
                "report_name": REPORT_NAME,
                "group_key": group_key,
                "contact_id": turn["contact_id"],
                "lead_id": turn["lead_id"],
                "talk_id": turn["talk_id"],
                "client_time": client_time,
                "manager_reply_time": reply_time,
                "response_minutes": diff_min,
                "status": "ANSWERED",
                "client_messages_in_turn": turn["count"],
                "manager_messages_in_reply": next_manager_turn["count"],
            })
            response_minutes.append(diff_min)
        else:
            rows.append({
                "report_date": DAY_START.date(),
                "report_name": REPORT_NAME,
                "group_key": group_key,
                "contact_id": turn["contact_id"],
                "lead_id": turn["lead_id"],
                "talk_id": turn["talk_id"],
                "client_time": client_time,
                "manager_reply_time": None,
                "response_minutes": None,
                "status": "WAITING",
                "client_messages_in_turn": turn["count"],
                "manager_messages_in_reply": None,
            })

    return rows, response_minutes


def format_minutes(value):
    if value is None:
        return "aniqlanmadi"
    total = int(round(value))
    h, m = divmod(total, 60)
    return f"{h} soat {m} daqiqa" if h else f"{m} daqiqa"


# ============================================================
# MAIN
# ============================================================

def main():
    if not ACCESS_TOKEN or ACCESS_TOKEN == "BU_YERGA_TOKENNI_QOY":
        print("ACCESS_TOKEN joyiga haqiqiy token qo'y.")
        sys.exit(1)

    manager_id, manager_name = get_manager_id_by_name(TARGET_MANAGER_NAME)
    if not manager_id:
        sys.exit(1)

    report_title = "Barcha Telegram chatlar"
    if FILTER_BY_RESPONSIBLE_MANAGER:
        report_title = manager_name

    print("\n" + "=" * 80)
    print(f"Sana: {DAY_START.strftime('%d.%m.%Y')}")
    print(f"Report: {report_title}")
    print(f"Manager filter user: {manager_name} | ID: {manager_id}")
    print(f"Responsible manager filter: {FILTER_BY_RESPONSIBLE_MANAGER}")
    print(f"Origin filter: {TELEGRAM_ORIGIN}")
    print("=" * 80)

    print("\nTelegram chat events olinmoqda...")
    events = fetch_chat_events()
    print(f"Jami Telegram chat events: {len(events)}")

    if not events:
        print("Telegram event topilmadi.")
        sys.exit(0)

    lead_ids = [e["lead_id"] for e in events if e["lead_id"]]
    print(f"Unik leadlar events ichida: {len(set(lead_ids))}")
    print("Lead info olinmoqda...")
    lead_info_map = fetch_lead_info_map(lead_ids)

    filtered_events = []
    for e in events:
        lead_info = lead_info_map.get(e["lead_id"], {})
        e["responsible_user_id"] = lead_info.get("responsible_user_id")
        e["contact_id"] = lead_info.get("contact_id") or e.get("linked_talk_contact_id")
        e["lead_name"] = lead_info.get("lead_name")
        if FILTER_BY_RESPONSIBLE_MANAGER and lead_info.get("responsible_user_id") != manager_id:
            continue
        filtered_events.append(e)

    print(f"Filtrdan keyin events: {len(filtered_events)}")

    if not filtered_events:
        print("Bu filter bo'yicha Telegram event topilmadi.")
        sys.exit(0)

    incoming_count = sum(1 for e in filtered_events if e["type"] == "incoming_chat_message")
    outgoing_count = sum(1 for e in filtered_events if e["type"] == "outgoing_chat_message")
    unique_contacts = set(e["contact_id"] for e in filtered_events if e["contact_id"])
    unique_talks = set(e["talk_id"] for e in filtered_events if e["talk_id"])
    unique_leads = set(e["lead_id"] for e in filtered_events if e["lead_id"])

    grouped = defaultdict(list)
    for e in filtered_events:
        group_key = e["talk_id"] or e["contact_id"] or e["lead_id"]
        grouped[group_key].append(e)

    all_rows = []
    all_response_minutes = []
    for group_key, group_events in grouped.items():
        rows, minutes = analyze_conversation(group_key, group_events)
        all_rows.extend(rows)
        all_response_minutes.extend(minutes)

    answered_turns = sum(1 for r in all_rows if r["status"] == "ANSWERED")
    waiting_turns = sum(1 for r in all_rows if r["status"] == "WAITING")
    client_turns = answered_turns + waiting_turns
    response_rate = (answered_turns / client_turns * 100) if client_turns else 0

    avg_response = (
        sum(all_response_minutes) / len(all_response_minutes)
        if all_response_minutes else None
    )
    sorted_minutes = sorted(all_response_minutes)
    if sorted_minutes:
        mid = len(sorted_minutes) // 2
        median_response = (
            sorted_minutes[mid] if len(sorted_minutes) % 2 == 1
            else (sorted_minutes[mid - 1] + sorted_minutes[mid]) / 2
        )
    else:
        median_response = None

    summary = {
        "report_date": DAY_START.date(),
        "report_name": REPORT_NAME,
        "unique_contacts": len(unique_contacts),
        "unique_talks": len(unique_talks),
        "unique_leads": len(unique_leads),
        "total_events": len(filtered_events),
        "client_messages": incoming_count,
        "manager_messages": outgoing_count,
        "client_turns": client_turns,
        "answered_turns": answered_turns,
        "waiting_turns": waiting_turns,
        "response_rate": round(response_rate, 2),
        "avg_response_minutes": round(avg_response, 2) if avg_response is not None else None,
        "median_response_minutes": round(median_response, 2) if median_response is not None else None,
    }

    print("\n" + "=" * 80)
    print(f"YAKUNIY NATIJA — {report_title} ({DAY_START.strftime('%d.%m.%Y')})")
    print("=" * 80)
    print(f"Unik contact/mijozlar            : {summary['unique_contacts']}")
    print(f"Unik talk/chatlar                : {summary['unique_talks']}")
    print(f"Unik lead/sdelkalar              : {summary['unique_leads']}")
    print(f"Jami Telegram chat eventlar      : {summary['total_events']}")
    print(f"Client xabarlari incoming        : {summary['client_messages']}")
    print(f"Manager javoblari outgoing       : {summary['manager_messages']}")
    print(f"Client turnlari                  : {summary['client_turns']}")
    print(f"Javob berilgan client turnlari   : {summary['answered_turns']}")
    print(f"Javob kutayotgan client turnlari : {summary['waiting_turns']}")
    print(f"Javob berish darajasi            : {summary['response_rate']:.2f}%")
    print(f"O'rtacha javob tezligi           : {format_minutes(summary['avg_response_minutes'])}")
    print(f"Median javob tezligi             : {format_minutes(summary['median_response_minutes'])}")
    print("=" * 80)

    waiting_examples = [r for r in all_rows if r["status"] == "WAITING"][:20]
    if waiting_examples:
        print("\nJavob kutilayotgan namunalar:")
        for r in waiting_examples:
            print(
                f"  contact_id={r['contact_id']} | lead_id={r['lead_id']} | "
                f"talk_id={r['talk_id']} | client_time={r['client_time'].strftime('%H:%M')} | "
                f"client_msgs={r['client_messages_in_turn']}"
            )

    answered_examples = [r for r in all_rows if r["status"] == "ANSWERED"][:20]
    if answered_examples:
        print("\nJavob berilgan namunalar:")
        for r in answered_examples:
            print(
                f"  contact_id={r['contact_id']} | lead_id={r['lead_id']} | "
                f"talk_id={r['talk_id']} | client_time={r['client_time'].strftime('%H:%M')} | "
                f"reply_time={r['manager_reply_time'].strftime('%H:%M')} | "
                f"response={format_minutes(r['response_minutes'])}"
            )

    if SAVE_TO_SQL:
        print("\nMySQL'ga yozilmoqda...")
        save_to_sql(summary, all_rows)
    else:
        print("\nMySQL'ga yozilmadi. Faqat terminal natijasi chiqarildi.")

    print(f"Tugadi: {datetime.now().strftime('%H:%M:%S')}")


if __name__ == "__main__":
    main()
