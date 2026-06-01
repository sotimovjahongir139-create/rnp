# RNP Analytics — Production Rebuild Design

**Date:** 2026-06-02
**Status:** Approved for planning (sources verified)
**Author:** drafted with Claude Code, validated live against every data source

---

## 1. Context

RNP Analytics is a business-intelligence dashboard for the **Arkon / Perfect** shoe-sole
manufacturing business (domain `arcon-perfect.uz`). UI is entirely in Uzbek.

The existing repo (`rnp/`) is a **polished React frontend on fake data** sitting on top of a
**backend coded against a database schema that was never built**. A full audit (see §13) found:
phantom tables, an unkeyed upsert, a MySQL-vs-reality engine mismatch, ETL scripts that mostly
don't exist in the repo, and 100% mock data in the UI.

The earlier effort failed because it was **built before the real data sources were understood
or verified**. This design corrects that: **every source below was connected to and read live
before this document was written.** Nothing here is assumed.

## 2. Goals / Non-goals

**Goals**
- One automated system that pulls real numbers from all four sources daily, with **zero manual
  weekly copy-paste** (today the production numbers are hand-queried each week).
- Keep the existing React dashboard UI (it is genuinely good).
- Rebuild the backend cleanly against a schema that matches the **real** data.
- Run everything on the existing Contabo VPS (`odin`), coexisting with the ~handful of other
  apps already there, touching none of them.
- Retire the Windows + MSSQL machine entirely.

**Non-goals (for now)**
- No redesign of the frontend visual design.
- No new analytics the current screens don't already show.
- No migration of historical MSSQL `calldb2` / `telegram_dashboard` data (re-pull from AmoCRM instead).
- Not touching the QC app (`sifat-nazorati`) — we read from it, we don't modify it.

## 3. Verified data sources (read live 2026-06-01/02)

| # | Screen | Source | Engine / location | Verification evidence |
|---|--------|--------|-------------------|------------------------|
| 1 | Klient-menejer (calls) | AmoCRM `/api/v4/events` type `incoming_call`/`outgoing_call` + linked note duration | AmoCRM cloud API, domain `numbersarkon.amocrm.ru`, account 31677678 "Arkon" | April 2026: 1,838 in / 680 out. May 2026: 992 in / 552 out. (June 1 ≈ 0 — month just started; this is why the calls path looked empty at first.) |
| 2 | Klient-menejer (Telegram) | AmoCRM `/api/v4/events` type `incoming_chat_message`/`outgoing_chat_message`, filtered to `origin == ru.whatcrm.telegram`; turns analysis for response time | same AmoCRM API | Live + fresh: 73 in / 105 out month-to-date (2026-06-01), 50 active talks. |
| 3 | Sifat nazorati (defects / brak) | `sifat-nazorati` app's `entries` table (operators type defects: sku, reason, category, qty) | **PostgreSQL** on `odin`, reached via the app's `DATABASE_URL` | 461 brak (25–31 May). Top model "Padosh - Brunelli cucunelli - oq" (271) — matches the dashboard mock 1:1. Real reasons + categories (qayta/yamala/orta). |
| 4 | Ishlab chiqarish (production) | `arconper_arcon` DB: `production_proizvodstvo` + `production_jarayon` (+ `_zakaz`, `_skladzakaz`, `_sotuv` for the sklad chain) | **MySQL** on cPanel host `de.ahost.cloud`, cPanel user `arconper` | 3,178 orders, Jan 5 → Jun 1 (today). Last-30d by workshop matches dashboard departments exactly (Quyish PU, Sifat Nazorati, Lazer, Chaxlash, Sklad, Quyish TEP). `brak` column = 0 here → defects really live only in source #3. |

**Key correction vs. the old repo:** calls/telegram raw data is in AmoCRM (re-pulled directly,
no MSSQL); defects are in a *separate Postgres app*, not the factory DB; the factory DB is MySQL
on cPanel. The old backend assumed all of this was one local MySQL with invented column names.

## 4. Target environment — `odin` (Contabo VPS)

- Ubuntu 24.04, 4 vCPU, 7.8 GB RAM, 73 GB free. **Not a clean box** — already runs other apps.
- Already installed/used: **PostgreSQL (active)**, Docker, **pm2**, **nginx** (reverse proxy),
  gunicorn. **No MySQL** server (we don't need one — see §6).
- Running neighbours (do not disturb): `diyor-saga` (pm2, :3000), `sifat-nazorati` (pm2),
  dockerized `yozly`, `scout`. Several pm2 entries are `stopped` (meeting-*).
- Busy ports: 22, 53, 80, 443, 3000, 3001, 3005, 3006, 5055, 5439, 5556, 6382, 8000, 8001, 8080, 8081.
- **Free ports confirmed: 3007, 3008, 3009, 3010, 4000.** rnp backend will take **3008** (or first free at deploy).
- Public IP **`62.169.31.240`** — used for the cPanel Remote-MySQL allow-list.

**Coexistence rules (hard constraints):**
- New nginx **server block only** (own `server_name`, e.g. `rnp.<domain>` or a path) — never edit
  another app's vhost.
- Own pm2 process `rnp-backend`. Own DB. Own directory `~/rnp`.
- No global package upgrades that could affect neighbours.

## 5. Architecture

```
                         ┌──────────────────────── odin (Ubuntu VPS) ────────────────────────┐
 AmoCRM API ──HTTPS──────┼─► etl/amo_calls.py ─────┐                                          │
 (calls + telegram)      │   etl/amo_telegram.py ──┤                                          │
                         │                          ├─► PostgreSQL  rnp_analytics ─► backend ─┼─► nginx ─► React dashboard
 arconper_arcon (MySQL,  ┼─► etl/production.py ─────┤      (new database)         (Node, pm2  │   (vhost)   (built, static)
 cPanel, remote read) ───┘                          │                              :3008)     │
                         │   etl/qc.py  ◄── sifat-nazorati Postgres (same box) ─────┘          │
                         │        ▲                                                            │
                         │   cron (daily ~06:00 Asia/Tashkent) runs all 4 collectors           │
                         └────────────────────────────────────────────────────────────────────┘
```

**Components**
- **`rnp_analytics` (PostgreSQL):** single analytics store. Postgres chosen because odin already
  runs it, the QC app is already Node+Postgres (proven pattern to mirror), and there is no MySQL
  server on the box. Source #4 being MySQL is irrelevant — the ETL reads MySQL and writes Postgres.
- **ETL (Python 3, `etl/`):** four idempotent collectors, each writing pre-aggregated rows. Reuse
  the proven AmoCRM fetch+calc logic from the user's existing scripts; replace their MSSQL/pyodbc
  write layer with `psycopg`. Run from `odin` via cron.
- **Backend (Node + Express + `pg`):** clean rewrite. Mirrors the `sifat-nazorati` app's stack and
  structure (JWT + bcrypt + helmet + express-rate-limit, MVC). Reads `rnp_analytics` only.
- **Frontend (React/Vite, kept):** `USE_MOCK=false`, real JWT login, `VITE_API_URL` → backend.
  Built to static, served by nginx.

## 6. Data model (`rnp_analytics`, PostgreSQL)

Tables are shaped to what the ETL actually produces (verified columns), not the old phantom schema.

- **`users`** — id, username, password_hash (bcrypt), role (`admin`|`manager`), is_active, created_at.
- **`call_stats`** — period_type(`daily`|`monthly`), period_date, manager_name, total_calls,
  incoming_answered, outgoing_answered, missed_clients, recalled_clients, not_recalled_clients,
  answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
  h_09_11 … h_21_23 (hourly buckets, inline as the real script produces).
  PK/unique `(period_type, period_date, manager_name)`.
- **`telegram_stats`** — report_date, unique_contacts, unique_talks, unique_leads, total_events,
  client_messages, manager_messages, client_turns, answered_turns, waiting_turns, response_rate,
  avg_response_minutes, median_response_minutes. Unique `(report_date)`.
- **`telegram_response_details`** — per-conversation rows (contact_id, lead_id, talk_id,
  client_time, manager_reply_time, response_minutes, status). For the categories chart.
- **`production_stats`** — stat_date, workshop (jarayon name), kirdi, bajarildi, efficiency_pct,
  avg_cycle_days, status. Unique `(stat_date, workshop)`. Derived from `production_proizvodstvo`.
- **`production_chain`** — stat_period, sklad_zakaz, sklad_kirim, sklad_kirim_done, sklad_chiqim,
  sklad_chiqim_approved (the zakaz→kirim→bajarildi funnel from `dashboard_queries.txt`).
- **`qc_stats`** — stat_date, total_defects, by category. Plus rollup helpers.
- **`qc_defects`** — stat_date, sku (model), reason, category, qty (mirrors `entries`, aggregated).
- **`kpi_results`** — daily/monthly rollups. **Real unique key** `(period_type, period_date,
  COALESCE(department, ''))` so upserts actually work (the old table had none → duplicate rows).

All upserts use `INSERT … ON CONFLICT … DO UPDATE` against real unique keys. ETL is **idempotent**:
re-running a day overwrites that day (the user's scripts already follow a delete-then-insert pattern).

## 7. ETL design (per source)

Each collector: pure-Python, reads `.env`, retries with backoff (the AmoCRM scripts already do),
logs to `etl/logs/`, writes one period's aggregates, exits non-zero on failure.

- **`amo_calls.py`** — port of `amocrm_april_report.py`. Fetch `incoming_call`/`outgoing_call`
  events for the target month + the previous day, resolve note durations, compute answered/missed/
  recall/hourly. **Target manager = `Asadbek` (locked decision).** Write `call_stats` (daily + monthly).
- **`amo_telegram.py`** — port of `amocrm_telegram_response.py`. Fetch chat-message events,
  filter `origin == ru.whatcrm.telegram`, build conversation turns, compute response_rate +
  avg/median response minutes. Write `telegram_stats` + `telegram_response_details`. (Reads the
  token from env, **not** hardcoded as the original did.)
- **`production.py`** — connect to `arconper_arcon` (MySQL, read-only), run the four verified
  queries from `dashboard_queries.txt` parameterised by date window, map `production_jarayon`
  names to the dashboard's six departments, compute kirdi/bajarildi/efficiency + the sklad chain.
  Write `production_stats` + `production_chain`.
- **`qc.py`** — read `sifat-nazorati`'s Postgres `entries` (read-only), aggregate by date / sku /
  reason / category. Write `qc_stats` + `qc_defects`. (Alternative considered: call the QC app's
  own analytics HTTP API — rejected, direct read is simpler and same box.)

**KPI job** (Node or SQL): roll `call_stats` + `telegram_stats` + `production_stats` into
`kpi_results` with real thresholds from `constants.js`. Replaces the old broken `calculate-kpi.job.js`.

## 8. Backend (clean rewrite, Node + Express + pg)

- Structure mirrors `sifat-nazorati`: `routes → controllers → services`, `db/` pool via `pg`.
- Endpoints map 1:1 to the frontend's existing `api.js` calls (production, crm/calls, telegram,
  qc, kpi, auth). Every query targets the §6 real schema.
- `/api/auth/login` (JWT, bcrypt, rate-limited). Roles: `admin`, `manager`.
- No `/api/sync` spawning Python from Node (the old fragile `python` vs `python3`, cwd-relative
  pattern is dropped). ETL is owned by cron; backend is read-only over the analytics DB.
- Adds: `/health`, env validation on boot (refuse to start without `JWT_SECRET` + DB url).

## 9. Frontend (kept, minimal changes)

- `USE_MOCK = false`; real login stores JWT; `VITE_API_URL` → backend.
- **New: QC page wired to live API** (was 100% mock with no backend at all).
- Build → static; nginx serves it + proxies `/api` to `:3008`.
- No visual redesign.

## 10. Auth & security

- **Rotate the leaked AmoCRM token** (it was shared in plaintext, valid to 2031) — blocking for go-live.
  New token lives only in `~/rnp/.env` on odin (gitignored), never hardcoded.
- `JWT_SECRET` strong, env-only, enforced on boot.
- Factory DB: dedicated **read-only** MySQL user; cPanel Remote-MySQL allow-list `62.169.31.240`
  (or, if remote MySQL is disallowed, run `production.py` on the cPanel side via its Cron and push).
- bcrypt passwords, helmet, rate-limited login, parameterised SQL (already the norm).
- `.env` files gitignored everywhere; no secrets in source or history.

## 11. Scheduling

- One cron on odin, daily ~06:00 Asia/Tashkent, runs all four collectors (they compute "yesterday"
  + month-to-date), then the KPI rollup. Per-source failure logged, others continue.
- Frontend polls the backend every 60s (existing behaviour) — now real data.

## 12. Deployment & ops

- Dir `~/rnp` on odin: `backend/`, `frontend/dist/`, `etl/`, `.env`.
- `pm2` process `rnp-backend` (port 3008), `pm2 save` for boot persistence.
- nginx: new server block, TLS via the existing cert tooling on the box.
- Backups: nightly `pg_dump rnp_analytics` into `~/backups` (source data is re-pullable, but cheap insurance).
- Logs: backend via pm2; ETL to `~/rnp/etl/logs`.

## 13. Cleanup (discard from old repo / system)

- Delete phantom-table code paths (`crm_calls`, `telegram_messages`) — replace with §6 tables.
- Delete the unkeyed `kpi_results` upsert; rebuild with a real unique key.
- Delete `production_etl.py`'s placeholder `production_table` query — replace with real queries.
- Delete `crm_sync.py` placeholder; delete the Node `script-runner` + `/api/sync` spawn model.
- Retire the Windows box + MSSQL `calldb2` / `telegram_dashboard` + the `.bat`.
- Remove the hardcoded AmoCRM token from any script.
- Reconcile `schema.sql` ↔ migrations (one source of truth; add a simple migration runner or use one tool).

## 14. Phased delivery

Each phase ends with a **demoable, verified** result.

| Phase | Scope | Done when |
|------|-------|-----------|
| **1. Foundation** | `~/rnp` on odin; create `rnp_analytics` Postgres + schema (§6); clean backend skeleton + real JWT login; nginx vhost; frontend deployed (still mock). | You can log in; `/health` green; dashboard loads alongside other apps, nothing else disturbed. |
| **2. Defects (QC)** | `etl/qc.py` reads sifat-nazorati → `qc_stats`/`qc_defects`; QC endpoints; wire QC page to API. | QC screen shows the real 461-brak data, auto-updating. |
| **3. Production** | Remote-MySQL access (or cPanel-side cron); `etl/production.py`; production endpoints; wire production screen. | "Ishlab chiqarish" shows real workshop numbers; **manual weekly query retired.** |
| **4. Calls + Telegram** | `etl/amo_calls.py` + `etl/amo_telegram.py` (rotated token); CRM endpoints; wire CRM screen; cron for all 4. | CRM screen shows real April/May-style numbers, refreshed daily. |
| **5. Go-live + harden** | Flip `USE_MOCK` off everywhere; remove mock data; token rotated; backups; monitoring; docs. | Whole dashboard on real data; no fakes; leaked token dead. |

## 15. Open items / risks

- **AmoCRM token rotation** (blocks Phase 4 go-live). Owner: user.
- **Remote MySQL** for factory DB: the implementer enables it at Phase 3 via the cPanel client
  portal (clients.ahost.uz, login on file) — add allow-list `62.169.31.240` + create a read-only
  user; else run the reader on the cPanel side via its Cron. (Tested today via phpMyAdmin SSO.)
- **`arconper_perfect`** (second cPanel DB) — purpose unknown; inspect at Phase 3, may hold extra data.
- **Call manager scope: `Asadbek` only (locked).**
- **AmoCRM events retention:** events fetch works for recent months; if older history needed, confirm
  retention window (not required for the live dashboard).
- **Cycle-time / weekly fields** for production: derive from `started`/`finished` dates in
  `production_proizvodstvo` (the old schema had columns the ETL never filled).

## 16. Testing strategy

- **Per source (already done once):** a live read returning real, sane numbers before wiring.
- **ETL:** each collector run against a known date window; assert row counts + non-null aggregates;
  idempotency check (run twice → same rows, no dupes).
- **Backend:** each endpoint returns the shape the frontend expects (contract test against `api.js`).
- **End-to-end:** Playwright login → each screen renders real values, zero console/API errors
  (reuse/adapt the existing `e2e_real.mjs`, but assert real-data invariants, not just "token present").
- **Coexistence:** after deploy, confirm neighbour apps (diyor-saga, sifat-nazorati, yozly, scout)
  still respond — rnp must not disturb them.
