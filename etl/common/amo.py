import os
import sys
import time
import requests

DOMAIN = os.getenv("AMOCRM_DOMAIN")
TOKEN = os.getenv("AMOCRM_TOKEN")
BASE = f"https://{DOMAIN}/api/v4" if DOMAIN else None
HEADERS = {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}
TIMEOUT, RETRIES, RETRY_DELAY = 60, 3, 5


def require_creds():
    if not DOMAIN or not TOKEN:
        print("FATAL: AMOCRM_DOMAIN / AMOCRM_TOKEN missing in env", file=sys.stderr)
        sys.exit(1)


def safe_get(path, params=None):
    url = f"{BASE}{path}"
    for attempt in range(1, RETRIES + 1):
        try:
            return requests.get(url, headers=HEADERS, params=params, timeout=TIMEOUT)
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError) as e:
            print(f"  conn error ({attempt}/{RETRIES}): {e}", file=sys.stderr)
            if attempt < RETRIES:
                time.sleep(RETRY_DELAY)
    raise RuntimeError("all retries failed")


def find_user_ids(target_names):
    r = safe_get("/users")
    if r.status_code == 401:
        print("FATAL: AmoCRM token invalid", file=sys.stderr)
        sys.exit(1)
    ids = {}
    for u in r.json().get("_embedded", {}).get("users", []):
        nm = u.get("name", "")
        if any(t.lower() in nm.lower() for t in target_names):
            ids[u["id"]] = nm
    return ids
