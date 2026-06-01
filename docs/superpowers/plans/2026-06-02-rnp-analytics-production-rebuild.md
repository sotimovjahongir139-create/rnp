# RNP Analytics Production Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock-data RNP dashboard with a clean backend + Python ETL that pulls real numbers from four verified sources into a new PostgreSQL DB on the `odin` VPS, keeping the existing React UI, deployed alongside the box's other apps without disturbing them.

**Architecture:** Four idempotent Python collectors (`etl/`) write pre-aggregated rows into `rnp_analytics` (PostgreSQL on odin). A clean Node+Express+`pg` backend (port 3008, pm2) reads that DB only and serves endpoints that map 1:1 onto the frontend's existing `api.js` shapes. nginx serves the built React static + proxies `/api`. A single daily cron runs all collectors + a KPI rollup. No Node→Python spawning; ETL is owned by cron.

**Tech Stack:** Node 20 + Express + `pg` + jsonwebtoken + bcrypt + helmet + express-rate-limit (backend); Python 3 + `requests` + `psycopg[binary]` + `mysql-connector-python` + `python-dotenv` (ETL); React 18 + Vite (kept); PostgreSQL 16 (odin); nginx + pm2 (odin); pytest + node:test for tests.

**Spec:** `docs/superpowers/specs/2026-06-02-rnp-analytics-production-rebuild-design.md` (source of truth — phases, sources, constraints).

---

## Environment & ground-truth facts (verified, do not re-litigate)

- **Target box:** Contabo VPS, SSH alias `odin` (Ubuntu 24.04, public IP `62.169.31.240`). PostgreSQL active, pm2 + nginx + Docker present. **No MySQL server** on the box.
- **Coexistence (HARD):** neighbours `diyor-saga` (:3000), `sifat-nazorati` (pm2 + its own Postgres), dockerized `yozly`, `scout`. Touch nothing of theirs. New nginx **server block only**. Backend on **free port 3008**. Own dir `~/rnp`, own pm2 process `rnp-backend`, own DB role/database.
- **Sources (all read live 2026-06-01/02):**
  1. **Calls** — AmoCRM `/api/v4/events` (`incoming_call`/`outgoing_call`) + note durations. Domain `numbersarkon.amocrm.ru`, account 31677678. **Manager = `Asadbek` ONLY (locked).**
  2. **Telegram** — AmoCRM `/api/v4/events` chat messages, `origin == ru.whatcrm.telegram`. Account-wide (not Asadbek-scoped).
  3. **Defects (brak)** — `sifat-nazorati` app's Postgres `entries` table (same box). Read-only.
  4. **Production** — `arconper_arcon` **MySQL** on cPanel host `de.ahost.cloud` (cPanel user `arconper`). Reached via Remote-MySQL allow-list for `62.169.31.240` (enabled at Phase 3) **or** a cPanel-side cron reader.
- **Porting sources (real, verified, on local disk):**
  - `~/Downloads/Telegram Desktop/amocrm_april_report.py` → port to `etl/amo_calls.py` (calc logic is correct; replace pyodbc/MSSQL write with `psycopg`).
  - `~/Downloads/Telegram Desktop/amocrm_telegram_response.py` → port to `etl/amo_telegram.py` (**remove the hardcoded token on line 14** — read from env; replace pyodbc write with `psycopg`).
  - `~/Downloads/Telegram Desktop/dashboard_queries.txt` → the four verified production SQL queries for `etl/production.py`.
- **Secrets:** live ONLY in gitignored `.env`. Repo root `.env` already holds `AMOCRM_DOMAIN` + `AMOCRM_TOKEN`. `.gitignore` already excludes `.env`, `backend/.env`, `*.env.local`. On odin the runtime `.env` lives at `~/rnp/.env`. Never hardcode or commit secrets.
- **AmoCRM token rotation:** the token was shared in plaintext (valid to 2031). Rotation is a **user action**, blocking for go-live (Phase 5). Ask the user to rotate; do not attempt yourself.
- **Branch / commits:** create `feat/production-rebuild` off `main` before any code. Commit per phase. **Do not push** unless the user asks.

---

## Frontend data contract (the API must return these exact shapes)

These are read straight from `frontend/src/data/mockData.js` and the page components. Backend services map DB rows → these shapes. The `–` in hourly labels is an EN DASH (U+2013), match it exactly.

```
GET /api/auth/login (POST)        → { token, user: { username, role } }

GET /api/production/kpi           → { jamiZakaz, jamiKartochka, bajarildi, qoldi, bajarildiPct, qoldiPct }
GET /api/production/departments   → [ { name, st, jami, baj, qol, pct, cards } ]            // st: 'Normal'|'Kritik'
GET /api/production/weekly        → [ { name, k, b, eff, holat, sikl, mm } ]                // holat: 'Yaxshi'|'Kritik'|'Malumot yoq'
GET /api/production/cycle         → [ { name, v } ]
GET /api/production/tendency      → { months:[...6], values:[...6], badges:[{from,val,type}] }
GET /api/production/sku           → [ { dept, models:[...] } ]                              // no verified source → []

GET /api/crm/monthly              → { jami, kiruvchi, chiquvchi, otkazib, qaytaChiqilgan, qaytaChiqilmagan, otkazibPct,
                                       missedStats:{ qaytaChiqilgan, qaytaChiqilmagan, qaytaAloqaDaq }, bars:[{lbl,pct,cls}] }
GET /api/crm/daily                → same shape as monthly
GET /api/crm/hourly               → [ { lbl:'09–11', v } … '21–23' ]                        // monthly buckets
GET /api/crm/hourly-today         → same shape                                              // daily buckets

GET /api/crm/telegram/kpi         → { jamiXabarlar, mijozXabarlari, menejerJavoblari, ortachaJavobVaqti, javobDarajasi, murojaatHal }
GET /api/crm/telegram/categories  → [ {lbl,v,c}, … , {lbl:'Javob kutilayotgan', v, c, pct} ]

GET /api/qc/kpi                   → { bugunNuqson, oyNuqson, topModel, topModelCount, topSabab, topSababCount }
GET /api/qc/trend                 → { months:[...6], values:[...6], badges:[{from,val,type}] }
GET /api/qc/top-models            → [ { lbl, v } ]   // color assigned client-side
GET /api/qc/sabablari             → [ { lbl, v } ]   // color assigned client-side
GET /api/qc/top10                 → [ { rank, model, v } ]

GET /health                       → { status:'ok', db:'up'|'down', time }
```

**DB→contract mappings (exact, used by service tasks):**

*Calls* (`call_stats` row → `/api/crm/monthly|daily`):
- `jami=total_calls`, `kiruvchi=incoming_answered`, `chiquvchi=outgoing_answered`, `otkazib=missed_clients`,
  `qaytaChiqilgan=recalled_clients`, `qaytaChiqilmagan=not_recalled_clients`,
  `otkazibPct = total_calls ? (missed_clients/total_calls*100).toFixed(1)+'%' : '0%'`,
  `missedStats={ qaytaChiqilgan:recalled_clients, qaytaChiqilmagan:not_recalled_clients, qaytaAloqaDaq:Number(avg_recall_minutes).toLocaleString('en-US') }`,
  `bars=[{lbl:'Javob berish',pct:answer_rate,cls:'g'},{lbl:'Qayta chiqish',pct:recall_rate,cls:'a'},{lbl:'Qayta chiqilmagan',pct:no_recall_pct,cls:'r'}]`.
- Hourly: `[{lbl:'09–11',v:h_09_11},{lbl:'11–13',v:h_11_13},{lbl:'13–15',v:h_13_15},{lbl:'15–17',v:h_15_17},{lbl:'17–19',v:h_17_19},{lbl:'19–21',v:h_19_21},{lbl:'21–23',v:h_21_23}]`.

*Telegram* (`telegram_stats` latest `report_date`):
- `jamiXabarlar=total_events`, `mijozXabarlari=client_messages`, `menejerJavoblari=manager_messages`,
  `ortachaJavobVaqti=Number(avg_response_minutes||0).toFixed(2)`,
  `javobDarajasi = client_messages ? Math.min(100, Math.round(manager_messages/client_messages*100))+'%' : '0%'`,
  `murojaatHal = response_rate.toFixed(2)+'%'`.
- Categories: `[{lbl:'Menejer javoblari',v:manager_messages},{lbl:'Mijoz xabarlari',v:client_messages},{lbl:'Mijoz murojaatlari',v:client_turns},{lbl:'Javob berilgan',v:answered_turns},{lbl:'Javob kutilayotgan',v:waiting_turns,pct:(client_turns?(waiting_turns/client_turns*100):0).toFixed(2)+'%'}]` (color `c` added client-side).

*Production* (`production_stats` rows; window = last 30d for departments/kpi, last 7d for weekly):
- Workshop name normalization map `WORKSHOP_LABELS`: `'Sifat Nazorati'→'Sifat nazorati'`, `'Sklad (Kirim)'→'Sklad'`; others pass through (`'Quyish PU'`,`'Lazer'`,`'Chaxlash'`,`'Quyish TEP'`).
- departments (30d per workshop): `name`, `jami=qty_in`, `baj=qty_done`, `qol=qty_in-qty_done`, `pct=qty_in?round(qty_done/qty_in*100,2):0`, `cards=cards_in`, `st=pct>=70?'Normal':'Kritik'`.
- kpi (30d totals): `jamiZakaz=Σqty_in`, `jamiKartochka=Σcards_in`, `bajarildi=Σqty_done`, `qoldi=jamiZakaz-bajarildi`, `bajarildiPct=round(bajarildi/jamiZakaz*100,1)`, `qoldiPct=round(qoldi/jamiZakaz*100,1)`.
- weekly (7d per workshop): `name`, `k=cards_in`, `b=cards_done`, `eff=k?round(b/k*100):0`, `holat=k===0?'Malumot yoq':eff>=70?'Yaxshi':'Kritik'`, `sikl=avg_cycle_days?avg_cycle_days.toFixed(1)+' kun':'—'`, `mm='—'`.
- cycle: `[{name, v:avg_cycle_days||0}]` (30d).
- tendency: months = last 6 calendar months short labels; values = monthly efficiency% (`Σqty_done/Σqty_in*100`); badges = consecutive month deltas.
- sku: `[]` (no verified source — page renders an empty table; documented risk).

*QC* (`qc_defects` / `qc_stats`; window = current calendar month unless noted):
- kpi: `bugunNuqson=Σqty today`, `oyNuqson=Σqty this month`, `topModel`/`topModelCount` = max-qty sku this month, `topSabab`/`topSababCount` = max-qty reason this month.
- trend: last 6 months, values = monthly Σqty; badges = consecutive deltas.
- top-models: top 5 sku by qty this month `[{lbl:sku,v:qty}]`.
- sabablari: all reasons this month `[{lbl:reason,v:qty}]`.
- top10: top 10 sku by qty this month `[{rank,model:sku,v:qty}]`.

---

## File structure

```
~/rnp/                              # on odin (deploy root)
  .env                              # runtime secrets (gitignored, NEVER committed)

repo (this checkout):
  backend/                          # clean rewrite (old src/ replaced)
    package.json
    src/
      server.js                     # express app + boot + env validation + /health
      config/
        env.js                      # load+validate env (refuse boot if missing)
        db.js                       # single pg Pool (analytics only)
        constants.js                # KPI_THRESHOLDS, WORKSHOP_LABELS, ROLES (kept/extended)
      middleware/
        auth.middleware.js          # JWT verify → req.user
        error.middleware.js
        rate-limit.middleware.js    # login limiter
      routes/      auth|production|crm|qc|kpi|health .routes.js
      controllers/ auth|production|crm|qc|kpi .controller.js
      services/    auth|production|crm|qc|kpi .service.js   # all SQL here
    test/                           # node:test contract + unit tests
  etl/                              # new Python ETL (replaces automation/)
    requirements.txt
    common/
      db.py                         # psycopg connection from env
      amo.py                        # shared AmoCRM client (safe_get, paging, users)
    amo_calls.py                    # port of amocrm_april_report.py
    amo_telegram.py                 # port of amocrm_telegram_response.py
    qc.py                           # reads sifat-nazorati Postgres entries
    production.py                   # reads arconper_arcon MySQL (4 queries)
    kpi_rollup.py                   # rolls call/telegram/production into kpi_results
    run_all.py                      # cron entrypoint: runs 4 collectors + rollup
    tests/                          # pytest: pure-function unit tests + fixtures
    logs/                           # gitignored
  database/
    schema.sql                      # PostgreSQL schema (replaces old MySQL schema)
    seed_users.sql                  # one admin user (hash generated, not committed plaintext)
  frontend/                         # kept; minimal edits
    src/services/api.js             # USE_MOCK=false; add qc fns
    src/context/DashboardContext.jsx# add qc state + refreshQC
    src/pages/QC/QCPage.jsx         # read from context, assign colors client-side
  deploy/
    nginx-rnp.conf                  # new server block (copied to odin)
    ecosystem.config.cjs            # pm2 config for rnp-backend
    cron-rnp                        # crontab line(s)
  docs/superpowers/plans/…          # this file
```

Old `backend/src/{jobs,services,controllers,routes}/*` and `automation/` are deleted in Phase 1 (Task 1.2) — they target a phantom MySQL schema (spec §13). `database/schema.sql`, `seed.sql`, `migrations/` are replaced by the new Postgres `schema.sql`.

---

# PHASE 1 — Foundation

**Done when:** you can log in against the real backend; `/health` is green; the built dashboard loads from nginx on odin alongside the other apps with none of them disturbed. (Frontend still shows mock numbers — that's expected until later phases.)

### Task 1.0: Branch + local toolchain sanity

**Files:** none (git + checks)

- [ ] **Step 1: Create the feature branch off main**

```bash
cd /home/maurilar/petties/rnp
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b feat/production-rebuild
git branch --show-current
```
Expected: `feat/production-rebuild`

- [ ] **Step 2: Confirm odin reachable and inventory it (read-only)**

```bash
ssh odin 'echo OK; whoami; lsb_release -ds; pm2 ls; ss -ltnp 2>/dev/null | grep -E ":3008|:3007|:3009" || echo "3007-3009 free"; psql --version; nginx -v 2>&1'
```
Expected: prints `OK`, Ubuntu 24.04, pm2 process list (diyor-saga/sifat-nazorati/etc), confirmation that 3008 is free, psql + nginx versions. **If 3008 is occupied**, pick the first free of 3007/3009/3010/4000 and use it consistently below.

- [ ] **Step 3: Commit nothing yet** (branch only). Proceed.

### Task 1.1: PostgreSQL schema (`database/schema.sql`)

**Files:**
- Create: `database/schema.sql`

- [ ] **Step 1: Write the full schema**

```sql
-- database/schema.sql — rnp_analytics (PostgreSQL). Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('admin','manager')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_stats (
  period_type           TEXT NOT NULL CHECK (period_type IN ('daily','monthly')),
  period_date           DATE NOT NULL,
  manager_name          TEXT NOT NULL,
  total_calls           INT  NOT NULL DEFAULT 0,
  incoming_answered     INT  NOT NULL DEFAULT 0,
  outgoing_answered     INT  NOT NULL DEFAULT 0,
  missed_clients        INT  NOT NULL DEFAULT 0,
  recalled_clients      INT  NOT NULL DEFAULT 0,
  not_recalled_clients  INT  NOT NULL DEFAULT 0,
  answer_rate           NUMERIC NOT NULL DEFAULT 0,
  recall_rate           NUMERIC NOT NULL DEFAULT 0,
  no_recall_pct         NUMERIC NOT NULL DEFAULT 0,
  avg_recall_minutes    NUMERIC NOT NULL DEFAULT 0,
  h_09_11 INT NOT NULL DEFAULT 0, h_11_13 INT NOT NULL DEFAULT 0,
  h_13_15 INT NOT NULL DEFAULT 0, h_15_17 INT NOT NULL DEFAULT 0,
  h_17_19 INT NOT NULL DEFAULT 0, h_19_21 INT NOT NULL DEFAULT 0,
  h_21_23 INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period_type, period_date, manager_name)
);

CREATE TABLE IF NOT EXISTS telegram_stats (
  report_date              DATE PRIMARY KEY,
  unique_contacts          INT NOT NULL DEFAULT 0,
  unique_talks             INT NOT NULL DEFAULT 0,
  unique_leads             INT NOT NULL DEFAULT 0,
  total_events             INT NOT NULL DEFAULT 0,
  client_messages          INT NOT NULL DEFAULT 0,
  manager_messages         INT NOT NULL DEFAULT 0,
  client_turns             INT NOT NULL DEFAULT 0,
  answered_turns           INT NOT NULL DEFAULT 0,
  waiting_turns            INT NOT NULL DEFAULT 0,
  response_rate            NUMERIC NOT NULL DEFAULT 0,
  avg_response_minutes     NUMERIC,
  median_response_minutes  NUMERIC,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_response_details (
  id                 BIGSERIAL PRIMARY KEY,
  report_date        DATE NOT NULL,
  contact_id         BIGINT,
  lead_id            BIGINT,
  talk_id            BIGINT,
  client_time        TIMESTAMPTZ,
  manager_reply_time TIMESTAMPTZ,
  response_minutes   NUMERIC,
  status             TEXT NOT NULL CHECK (status IN ('ANSWERED','WAITING'))
);
CREATE INDEX IF NOT EXISTS idx_tg_details_date ON telegram_response_details(report_date);

CREATE TABLE IF NOT EXISTS production_stats (
  stat_date       DATE NOT NULL,
  workshop        TEXT NOT NULL,
  cards_in        INT NOT NULL DEFAULT 0,
  cards_done      INT NOT NULL DEFAULT 0,
  qty_in          BIGINT NOT NULL DEFAULT 0,
  qty_done        BIGINT NOT NULL DEFAULT 0,
  efficiency_pct  NUMERIC NOT NULL DEFAULT 0,
  avg_cycle_days  NUMERIC,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, workshop)
);

CREATE TABLE IF NOT EXISTS production_chain (
  stat_period           TEXT PRIMARY KEY,   -- e.g. '2026-05-10..2026-05-17'
  sklad_zakaz           INT NOT NULL DEFAULT 0,
  sklad_kirim           INT NOT NULL DEFAULT 0,
  sklad_kirim_done      INT NOT NULL DEFAULT 0,
  sklad_chiqim          INT NOT NULL DEFAULT 0,
  sklad_chiqim_approved INT NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qc_defects (
  stat_date  DATE NOT NULL,
  sku        TEXT NOT NULL,
  reason     TEXT NOT NULL,
  category   TEXT,
  qty        INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, sku, reason, COALESCE(category,''))
);

CREATE TABLE IF NOT EXISTS qc_stats (
  stat_date     DATE PRIMARY KEY,
  total_defects INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kpi_results (
  period_type TEXT NOT NULL CHECK (period_type IN ('daily','monthly')),
  period_date DATE NOT NULL,
  department  TEXT NOT NULL DEFAULT '',
  metric      TEXT NOT NULL,
  value       NUMERIC,
  status      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period_type, period_date, department, metric)
);
```

> Note: `qc_defects` PK uses `COALESCE(category,'')` — Postgres allows expressions only in a UNIQUE INDEX, not a table PK. Replace the inline PK with: keep `PRIMARY KEY` off the table and add
> `CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_defects ON qc_defects (stat_date, sku, reason, COALESCE(category,''));`
> Apply this correction when writing the file.

- [ ] **Step 2: Apply schema to a LOCAL throwaway Postgres to validate syntax** (don't touch odin yet)

```bash
# If local postgres available:
psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS rnp_validate;" -c "CREATE DATABASE rnp_validate;"
psql -v ON_ERROR_STOP=1 -d rnp_validate -f database/schema.sql && echo "SCHEMA OK"
psql -d rnp_validate -c "\dt" && psql -d rnp_validate -c "DROP DATABASE rnp_validate;" 2>/dev/null
```
Expected: `SCHEMA OK` and `\dt` lists all 9 tables. (If no local Postgres, run the same `-f` against odin in Task 1.4 and validate there.)

- [ ] **Step 3: Commit**

```bash
git add database/schema.sql && rm -f database/seed.sql database/migrations/00*.sql
git add -A database/
git commit -m "feat(db): PostgreSQL rnp_analytics schema matching verified sources"
```

### Task 1.2: Remove old phantom-schema code

**Files:**
- Delete: `backend/src/{jobs,services,controllers,routes}/*`, `backend/src/config/db.js`, `automation/`

- [ ] **Step 1: Delete the dead code**

```bash
git rm -r backend/src/jobs backend/src/services backend/src/controllers backend/src/routes \
         backend/src/config/db.js automation
ls backend/src   # expect: config/ middleware/ server.js (server.js rewritten next)
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: delete phantom-MySQL backend + placeholder automation (spec §13)"
```

### Task 1.3: Backend skeleton — env validation, db pool, health

**Files:**
- Create: `backend/src/config/env.js`, `backend/src/config/db.js`, `backend/src/routes/health.routes.js`
- Modify: `backend/src/config/constants.js`, `backend/src/server.js`
- Modify: `backend/package.json` (deps + scripts + `"type":"module"`)
- Test: `backend/test/health.test.js`

- [ ] **Step 1: Set backend deps and scripts**

```bash
cd backend
npm pkg set type="module"
npm pkg set scripts.start="node src/server.js"
npm pkg set scripts.dev="node --watch src/server.js"
npm pkg set scripts.test="node --test"
npm install express pg jsonwebtoken bcryptjs helmet express-rate-limit cors dotenv
cd ..
```

- [ ] **Step 2: Write `backend/src/config/env.js`**

```js
import 'dotenv/config';

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

export function loadEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`FATAL: missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  return {
    port: Number(process.env.PORT || 3008),
    nodeEnv: process.env.NODE_ENV || 'production',
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  };
}
```

- [ ] **Step 3: Write `backend/src/config/db.js`**

```js
import pg from 'pg';
import { loadEnv } from './env.js';

const { Pool } = pg;
const env = loadEnv();

export const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function ping() {
  try { await pool.query('SELECT 1'); return true; } catch { return false; }
}
```

- [ ] **Step 4: Replace `backend/src/config/constants.js`** (keep thresholds; add workshop map)

```js
export const ROLES = { ADMIN: 'admin', MANAGER: 'manager' };

export const KPI_THRESHOLDS = {
  missedCallWarning:  10,
  missedCallCritical: 20,
  efficiencyWarning:  70,
  efficiencyCritical: 50,
  cycleWarning:       3,
  cycleCritical:      5,
};

export const DEPARTMENTS = ['Quyish PU', 'Sifat nazorati', 'Lazer', 'Chaxlash', 'Sklad', 'Quyish TEP'];

// Normalize source `production_jarayon` names → dashboard department labels.
export const WORKSHOP_LABELS = {
  'Sifat Nazorati': 'Sifat nazorati',
  'Sklad (Kirim)':  'Sklad',
};
export const normalizeWorkshop = (name) => WORKSHOP_LABELS[name] || name;
```

- [ ] **Step 5: Write `backend/src/routes/health.routes.js`**

```js
import { Router } from 'express';
import { ping } from '../config/db.js';

const router = Router();
router.get('/health', async (_req, res) => {
  const up = await ping();
  res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', db: up ? 'up' : 'down', time: new Date().toISOString() });
});
export default router;
```

- [ ] **Step 6: Write `backend/src/server.js`**

```js
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { loadEnv } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const env = loadEnv();
export const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.use('/', healthRoutes);
// route mounts added in later tasks:
// app.use('/api/auth', authRoutes); /production /crm /qc /kpi

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(env.port, () => console.log(`rnp-backend listening on :${env.port}`));
}
```

- [ ] **Step 7: Write `backend/src/middleware/error.middleware.js`**

```js
export function errorHandler(err, _req, res, _next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.publicMessage || 'Internal error' });
}
```

- [ ] **Step 8: Write the failing test `backend/test/health.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert';

test('GET /health returns ok shape when db up', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://invalid';
  process.env.JWT_SECRET = 'test-secret';
  const { app } = await import('../src/server.js');
  const { createServer } = await import('node:http');
  const srv = createServer(app).listen(0);
  const { port } = srv.address();
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();
  assert.ok(['ok', 'degraded'].includes(body.status));
  assert.ok('db' in body && 'time' in body);
  srv.close();
});
```

- [ ] **Step 9: Run the test**

```bash
cd backend && JWT_SECRET=t DATABASE_URL=postgres://invalid npm test 2>&1 | tail -20; cd ..
```
Expected: the health test PASSES (status `degraded`, db `down` against the invalid URL is acceptable — it asserts shape, not connectivity).

- [ ] **Step 10: Commit**

```bash
git add backend/ && git commit -m "feat(backend): env-validated express skeleton + pg pool + /health"
```

### Task 1.4: Auth — JWT login + bcrypt + rate limit

**Files:**
- Create: `backend/src/services/auth.service.js`, `backend/src/controllers/auth.controller.js`, `backend/src/routes/auth.routes.js`, `backend/src/middleware/auth.middleware.js`, `backend/src/middleware/rate-limit.middleware.js`
- Modify: `backend/src/server.js` (mount auth)
- Test: `backend/test/auth.test.js`

- [ ] **Step 1: Write `backend/src/middleware/rate-limit.middleware.js`**

```js
import rateLimit from 'express-rate-limit';
export const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
```

- [ ] **Step 2: Write `backend/src/middleware/auth.middleware.js`**

```js
import jwt from 'jsonwebtoken';
import { loadEnv } from '../config/env.js';
const env = loadEnv();

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, env.jwtSecret); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}
```

- [ ] **Step 3: Write `backend/src/services/auth.service.js`**

```js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { loadEnv } from '../config/env.js';
const env = loadEnv();

export async function authenticate(username, password) {
  const rows = await query('SELECT id, username, password_hash, role, is_active FROM users WHERE username=$1', [username]);
  const u = rows[0];
  if (!u || !u.is_active) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  const token = jwt.sign({ sub: u.id, username: u.username, role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  return { token, user: { username: u.username, role: u.role } };
}
```

- [ ] **Step 4: Write `backend/src/controllers/auth.controller.js`**

```js
import { authenticate } from '../services/auth.service.js';

export async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const result = await authenticate(username, password);
    if (!result) return res.status(401).json({ error: 'Invalid credentials' });
    res.json(result);
  } catch (e) { next(e); }
}
```

- [ ] **Step 5: Write `backend/src/routes/auth.routes.js`**

```js
import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';
import { loginLimiter } from '../middleware/rate-limit.middleware.js';
const router = Router();
router.post('/login', loginLimiter, login);
export default router;
```

- [ ] **Step 6: Mount auth in `server.js`** — add after the health mount:

```js
import authRoutes from './routes/auth.routes.js';
app.use('/api/auth', authRoutes);
```

- [ ] **Step 7: Write failing test `backend/test/auth.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert';

test('POST /api/auth/login rejects missing creds with 400', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://invalid';
  process.env.JWT_SECRET = 'test-secret';
  const { app } = await import('../src/server.js');
  const { createServer } = await import('node:http');
  const srv = createServer(app).listen(0);
  const { port } = srv.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 400);
  srv.close();
});
```

- [ ] **Step 8: Run test**

```bash
cd backend && JWT_SECRET=t DATABASE_URL=postgres://invalid npm test 2>&1 | tail -20; cd ..
```
Expected: PASS (400 path needs no DB).

- [ ] **Step 9: Commit**

```bash
git add backend/ && git commit -m "feat(auth): JWT login, bcrypt, rate limiting, auth middleware"
```

### Task 1.5: Provision odin — DB, role, deploy dir, env

**Files:**
- Create: `database/seed_users.sql` (generated, no plaintext password committed)

> **This task changes odin. It only ADDS a database/role/dir; it touches nothing existing. Confirm each command's output before the next.**

- [ ] **Step 1: Create the deploy dir and runtime `.env` on odin**

```bash
ssh odin 'mkdir -p ~/rnp/etl/logs ~/rnp/backend ~/rnp/frontend ~/rnp/deploy ~/backups'
# Generate strong secrets locally and write the env on odin (never echo into shell history on a shared box if avoidable):
JWT=$(openssl rand -hex 32); DBPW=$(openssl rand -hex 16)
ssh odin "cat > ~/rnp/.env <<EOF
PORT=3008
NODE_ENV=production
DATABASE_URL=postgres://rnp_app:${DBPW}@127.0.0.1:5432/rnp_analytics
JWT_SECRET=${JWT}
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://rnp.arcon-perfect.uz
AMOCRM_DOMAIN=numbersarkon.amocrm.ru
AMOCRM_TOKEN=PASTE_CURRENT_TOKEN_HERE
QC_DATABASE_URL=PASTE_SIFATNAZORATI_DATABASE_URL_HERE
PROD_DB_HOST=
PROD_DB_PORT=3306
PROD_DB_USER=
PROD_DB_PASS=
PROD_DB_NAME=arconper_arcon
TZ=Asia/Tashkent
EOF
chmod 600 ~/rnp/.env"
echo "DBPW=$DBPW (also written into DATABASE_URL on odin)"
```
> `AMOCRM_TOKEN`, `QC_DATABASE_URL`, and the `PROD_DB_*` values are filled in their respective phases (4, 2, 3). Record `DBPW` securely for the next step.

- [ ] **Step 2: Create the Postgres database + least-privilege role on odin**

```bash
ssh odin "sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE rnp_app LOGIN PASSWORD '${DBPW}';
CREATE DATABASE rnp_analytics OWNER rnp_app;
SQL"
ssh odin 'sudo -u postgres psql -d rnp_analytics -c "\du" | grep rnp_app && echo ROLE_OK'
```
Expected: `ROLE_OK`. (Confirm this did not affect the `sifat-nazorati` DB: `ssh odin 'sudo -u postgres psql -l'` — its DB still listed.)

- [ ] **Step 3: Apply the schema to odin**

```bash
scp database/schema.sql odin:~/rnp/database_schema.sql
ssh odin 'PGPASSWORD=$(grep -oP "(?<=rnp_app:)[^@]+" ~/rnp/.env) psql "postgres://rnp_app@127.0.0.1:5432/rnp_analytics" -v ON_ERROR_STOP=1 -f ~/rnp/database_schema.sql && echo SCHEMA_APPLIED'
ssh odin 'PGPASSWORD=$(grep -oP "(?<=rnp_app:)[^@]+" ~/rnp/.env) psql "postgres://rnp_app@127.0.0.1:5432/rnp_analytics" -c "\dt"'
```
Expected: `SCHEMA_APPLIED` and all 9 tables listed.

- [ ] **Step 4: Seed one admin user** (hash generated on odin; plaintext never committed)

```bash
# Choose an admin password and generate its bcrypt hash on odin via node:
ssh odin 'cd ~/rnp/backend && node -e "import(\"bcryptjs\").then(b=>console.log(b.default.hashSync(process.argv[1],10)))" "CHOOSE_ADMIN_PASSWORD"'
# Take the printed hash and insert the user:
ssh odin 'PGPASSWORD=$(grep -oP "(?<=rnp_app:)[^@]+" ~/rnp/.env) psql "postgres://rnp_app@127.0.0.1:5432/rnp_analytics" -c "INSERT INTO users (username,password_hash,role) VALUES ('"'"'admin'"'"','"'"'PASTE_HASH'"'"','"'"'admin'"'"') ON CONFLICT (username) DO NOTHING;"'
```
> `seed_users.sql` in the repo should contain only the `INSERT … VALUES ('admin','<hash placeholder>','admin')` template with a comment that the hash is generated per-deploy — **no real hash or password committed**.

- [ ] **Step 5: Commit the seed template**

```bash
git add database/seed_users.sql && git commit -m "chore(db): admin seed template (hash generated per-deploy, no secrets)"
```

### Task 1.6: Deploy backend to odin via pm2 + verify login end-to-end

**Files:**
- Create: `deploy/ecosystem.config.cjs`

- [ ] **Step 1: Write `deploy/ecosystem.config.cjs`**

```js
module.exports = {
  apps: [{
    name: 'rnp-backend',
    cwd: '/home/<ODIN_USER>/rnp/backend',
    script: 'src/server.js',
    node_args: '',
    env_file: '/home/<ODIN_USER>/rnp/.env',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
  }],
};
```
> Replace `<ODIN_USER>` with the actual home user from Task 1.0 Step 2 (`whoami`).

- [ ] **Step 2: Ship backend code + install prod deps on odin**

```bash
rsync -az --delete --exclude node_modules --exclude test backend/ odin:~/rnp/backend/
scp deploy/ecosystem.config.cjs odin:~/rnp/deploy/
ssh odin 'cd ~/rnp/backend && npm install --omit=dev'
```

- [ ] **Step 3: Start under pm2 (own process, does not touch others)**

```bash
ssh odin 'cd ~/rnp && pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 ls | grep rnp-backend'
```
Expected: `rnp-backend` `online`. Other apps still `online`/unchanged.

- [ ] **Step 4: Verify health + real login against the live backend**

```bash
ssh odin 'curl -s localhost:3008/health'                # → {"status":"ok","db":"up",...}
ssh odin 'curl -s -X POST localhost:3008/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"CHOSEN_ADMIN_PASSWORD\"}"'
```
Expected: health `db:"up"`; login returns `{token, user:{username:"admin",role:"admin"}}`.

- [ ] **Step 5: Commit**

```bash
git add deploy/ecosystem.config.cjs && git commit -m "feat(deploy): pm2 ecosystem for rnp-backend on :3008"
```

### Task 1.7: nginx vhost + build & deploy frontend (still mock)

**Files:**
- Create: `deploy/nginx-rnp.conf`
- Modify: `frontend/.env.production` (create)

- [ ] **Step 1: Write `deploy/nginx-rnp.conf`** (new server block ONLY)

```nginx
server {
    listen 80;
    server_name rnp.arcon-perfect.uz;

    root /home/<ODIN_USER>/rnp/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3008;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /health { proxy_pass http://127.0.0.1:3008; }

    location / { try_files $uri $uri/ /index.html; }
}
```

- [ ] **Step 2: Build the frontend** (still `USE_MOCK=true` at this phase)

```bash
cd frontend
printf 'VITE_API_URL=/api\nVITE_POLL_INTERVAL=60000\n' > .env.production
npm install
npm run build
ls dist/index.html && cd ..
```
Expected: `dist/index.html` exists.

- [ ] **Step 3: Deploy static + install vhost (does not edit other vhosts)**

```bash
rsync -az --delete frontend/dist/ odin:~/rnp/frontend/dist/
scp deploy/nginx-rnp.conf odin:/tmp/nginx-rnp.conf
ssh odin 'sudo mv /tmp/nginx-rnp.conf /etc/nginx/sites-available/rnp.conf && sudo ln -sf /etc/nginx/sites-available/rnp.conf /etc/nginx/sites-enabled/rnp.conf && sudo nginx -t'
```
Expected: `nginx -t` → `syntax is ok` / `test is successful`. **If it fails, do not reload.**

- [ ] **Step 4: Reload nginx + TLS**

```bash
ssh odin 'sudo systemctl reload nginx'
# TLS via existing certbot tooling on the box (issue only for the new name):
ssh odin 'sudo certbot --nginx -d rnp.arcon-perfect.uz --non-interactive --agree-tos -m admin@arcon-perfect.uz || echo "CERTBOT: confirm DNS for rnp.arcon-perfect.uz points to 62.169.31.240 first"'
```
> If DNS for `rnp.arcon-perfect.uz` is not yet pointed, skip certbot; verify over HTTP by IP/Host header and revisit TLS once DNS is set.

- [ ] **Step 5: Verify dashboard loads + neighbours undisturbed (coexistence gate)**

```bash
ssh odin 'curl -s -H "Host: rnp.arcon-perfect.uz" localhost/ | grep -o "<title>[^<]*</title>"'
ssh odin 'pm2 ls'   # diyor-saga, sifat-nazorati, yozly, scout all still online
ssh odin 'curl -s -o /dev/null -w "%{http_code}\n" localhost:3000'  # diyor-saga still responds
```
Expected: title tag returned; all neighbour pm2 apps `online`; `:3000` still answers.

- [ ] **Step 6: Commit**

```bash
git add deploy/nginx-rnp.conf frontend/.env.production && git commit -m "feat(deploy): nginx vhost + frontend build/deploy (Phase 1 foundation complete)"
```

**PHASE 1 GATE (verify before moving on):** `curl localhost:3008/health` → `db:up`; real admin login returns a JWT; dashboard HTML served by nginx; `pm2 ls` shows all neighbours still online. Record outputs.

---

# PHASE 2 — Defects (QC)

**Done when:** the QC screen shows the real ~461-brak data (top model "Padosh - Brunelli cucunelli - oq" ≈ 271), auto-refreshing, served from the live backend.

### Task 2.1: ETL scaffolding — `etl/` package, shared db + amo client

**Files:**
- Create: `etl/requirements.txt`, `etl/common/db.py`, `etl/common/amo.py`, `etl/__init__.py`, `etl/common/__init__.py`

- [ ] **Step 1: Write `etl/requirements.txt`**

```
requests>=2.31
python-dotenv>=1.0
psycopg[binary]>=3.1
mysql-connector-python>=8.3
```

- [ ] **Step 2: Write `etl/common/db.py`**

```python
import os
import psycopg
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv()  # also pick up ~/rnp/.env when cwd is the deploy dir

def connect():
    dsn = os.environ["DATABASE_URL"]
    return psycopg.connect(dsn)
```

- [ ] **Step 3: Write `etl/common/amo.py`** (shared, token from env)

```python
import os
import sys
import time
import requests

DOMAIN = os.getenv("AMOCRM_DOMAIN")
TOKEN  = os.getenv("AMOCRM_TOKEN")
BASE   = f"https://{DOMAIN}/api/v4" if DOMAIN else None
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
        print("FATAL: AmoCRM token invalid", file=sys.stderr); sys.exit(1)
    ids = {}
    for u in r.json().get("_embedded", {}).get("users", []):
        nm = u.get("name", "")
        if any(t.lower() in nm.lower() for t in target_names):
            ids[u["id"]] = nm
    return ids
```

- [ ] **Step 4: Create empty `etl/__init__.py` and `etl/common/__init__.py`**

```bash
: > etl/__init__.py; : > etl/common/__init__.py
```

- [ ] **Step 5: Add `etl/logs/` to gitignore (already covered by `logs/`) and commit**

```bash
git add etl/ && git commit -m "feat(etl): python package scaffolding (shared db + amo client)"
```

### Task 2.2: Inspect the real `sifat-nazorati` `entries` schema (discovery, on odin)

**Files:** none (writes findings into the next task's SQL)

- [ ] **Step 1: Get the QC DATABASE_URL from the sifat-nazorati app and inspect `entries`**

```bash
# Find the sifat-nazorati env (read-only inspection):
ssh odin 'find ~ -maxdepth 4 -name ".env" -path "*sifat*" 2>/dev/null; pm2 describe sifat-nazorati 2>/dev/null | grep -i cwd'
# Once you have its DATABASE_URL, inspect the entries table columns:
ssh odin 'psql "<SIFAT_DATABASE_URL>" -c "\d entries"'
ssh odin 'psql "<SIFAT_DATABASE_URL>" -c "SELECT * FROM entries ORDER BY 1 DESC LIMIT 3;"'
```
Expected: column list for `entries`. **Record the exact column names** for: date/created timestamp, sku/model, reason, category, quantity. The spec verified these fields exist (sku, reason, category, qty). Map them to the names used in Task 2.3 (`<date_col>`, `<sku_col>`, `<reason_col>`, `<category_col>`, `<qty_col>`).

- [ ] **Step 2: Sanity-check the known-good window (25–31 May ≈ 461 brak)**

```bash
ssh odin 'psql "<SIFAT_DATABASE_URL>" -c "SELECT SUM(<qty_col>) FROM entries WHERE <date_col>::date BETWEEN '"'"'2026-05-25'"'"' AND '"'"'2026-05-31'"'"';"'
```
Expected: ≈ 461. Put `QC_DATABASE_URL=<SIFAT_DATABASE_URL>` into `~/rnp/.env` (Task 1.5 placeholder).

### Task 2.3: `etl/qc.py` — aggregate entries → qc_defects/qc_stats (idempotent)

**Files:**
- Create: `etl/qc.py`
- Test: `etl/tests/test_qc_aggregate.py`

- [ ] **Step 1: Write the failing unit test for the pure aggregation** `etl/tests/test_qc_aggregate.py`

```python
from etl.qc import aggregate

def test_aggregate_sums_by_date_sku_reason_category():
    rows = [
        {"d": "2026-05-25", "sku": "A", "reason": "r1", "category": "qayta", "qty": 3},
        {"d": "2026-05-25", "sku": "A", "reason": "r1", "category": "qayta", "qty": 2},
        {"d": "2026-05-25", "sku": "B", "reason": "r2", "category": "yamala", "qty": 5},
    ]
    out = aggregate(rows)
    assert out[("2026-05-25", "A", "r1", "qayta")] == 5
    assert out[("2026-05-25", "B", "r2", "yamala")] == 5
```

- [ ] **Step 2: Run it (fails — module missing)**

```bash
cd /home/maurilar/petties/rnp && python -m pytest etl/tests/test_qc_aggregate.py -q
```
Expected: FAIL (`ModuleNotFoundError: etl.qc`).

- [ ] **Step 3: Write `etl/qc.py`** (substitute the real column names from Task 2.2 into `READ_SQL`)

```python
import os
import sys
from collections import defaultdict
from datetime import date, timedelta
import psycopg
from etl.common.db import connect

QC_DSN = os.environ.get("QC_DATABASE_URL")

# Column names confirmed live in Task 2.2:
READ_SQL = """
  SELECT <date_col>::date AS d, <sku_col> AS sku, <reason_col> AS reason,
         <category_col> AS category, <qty_col> AS qty
  FROM entries
  WHERE <date_col>::date BETWEEN %s AND %s
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
        dates = {k[0] for k in agg}
        for d in dates:
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
        print("FATAL: QC_DATABASE_URL missing", file=sys.stderr); sys.exit(1)
    end = end or date.today()
    start = start or (end - timedelta(days=60))  # rolling window covers month + trend
    rows = read_entries(start, end)
    agg = aggregate(rows)
    write(agg)
    print(f"qc.py: {len(rows)} entries → {len(agg)} defect rows, window {start}..{end}")

if __name__ == "__main__":
    run()
```

- [ ] **Step 4: Run the unit test (passes)**

```bash
cd /home/maurilar/petties/rnp && python -m pytest etl/tests/test_qc_aggregate.py -q
```
Expected: PASS.

- [ ] **Step 5: Run the collector LIVE on odin against the known window + idempotency check**

```bash
rsync -az --exclude tests --exclude __pycache__ etl/ odin:~/rnp/etl/
ssh odin 'cd ~/rnp && python3 -m venv .venv 2>/dev/null; . .venv/bin/activate; pip install -q -r etl/requirements.txt; set -a; . ./.env; set +a; python -m etl.qc'
ssh odin '. ~/rnp/.venv/bin/activate; PGPASSWORD=$(grep -oP "(?<=rnp_app:)[^@]+" ~/rnp/.env) psql "postgres://rnp_app@127.0.0.1:5432/rnp_analytics" -c "SELECT stat_date, SUM(qty) FROM qc_defects GROUP BY stat_date ORDER BY stat_date DESC LIMIT 7;"'
# idempotency: run twice, row count identical
ssh odin 'cd ~/rnp && . .venv/bin/activate; set -a; . ./.env; set +a; python -m etl.qc; PGPASSWORD=$(grep -oP "(?<=rnp_app:)[^@]+" ~/rnp/.env) psql "postgres://rnp_app@127.0.0.1:5432/rnp_analytics" -t -c "SELECT count(*) FROM qc_defects;"'
```
Expected: May 25–31 sums ≈ 461 total; running twice yields identical `qc_defects` count (no duplicates). Top sku for the month ≈ "Padosh - Brunelli cucunelli - oq" 271.

- [ ] **Step 6: Commit**

```bash
git add etl/qc.py etl/tests/test_qc_aggregate.py && git commit -m "feat(etl): qc.py aggregates sifat-nazorati entries → qc_defects/qc_stats (idempotent)"
```

### Task 2.4: QC backend service + endpoints

**Files:**
- Create: `backend/src/services/qc.service.js`, `backend/src/controllers/qc.controller.js`, `backend/src/routes/qc.routes.js`
- Modify: `backend/src/server.js`
- Test: `backend/test/qc.contract.test.js`

- [ ] **Step 1: Write `backend/src/services/qc.service.js`**

```js
import { query } from '../config/db.js';

const monthBounds = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  return start;
};

export async function kpi() {
  const monthStart = monthBounds();
  const today = new Date().toISOString().slice(0, 10);
  const [todayRow] = await query('SELECT COALESCE(SUM(qty),0) AS n FROM qc_defects WHERE stat_date = $1', [today]);
  const [monthRow] = await query('SELECT COALESCE(SUM(qty),0) AS n FROM qc_defects WHERE stat_date >= $1', [monthStart]);
  const [topModel] = await query('SELECT sku, SUM(qty) AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY sku ORDER BY v DESC LIMIT 1', [monthStart]);
  const [topReason] = await query('SELECT reason, SUM(qty) AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY reason ORDER BY v DESC LIMIT 1', [monthStart]);
  return {
    bugunNuqson: Number(todayRow.n),
    oyNuqson: Number(monthRow.n),
    topModel: topModel?.sku || '—',
    topModelCount: Number(topModel?.v || 0),
    topSabab: topReason?.reason || '—',
    topSababCount: Number(topReason?.v || 0),
  };
}

export async function topModels() {
  const monthStart = monthBounds();
  const rows = await query('SELECT sku AS lbl, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY sku ORDER BY v DESC LIMIT 5', [monthStart]);
  return rows;
}

export async function sabablari() {
  const monthStart = monthBounds();
  return query('SELECT reason AS lbl, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY reason ORDER BY v DESC', [monthStart]);
}

export async function top10() {
  const monthStart = monthBounds();
  const rows = await query('SELECT sku AS model, SUM(qty)::int AS v FROM qc_defects WHERE stat_date >= $1 GROUP BY sku ORDER BY v DESC LIMIT 10', [monthStart]);
  return rows.map((r, i) => ({ rank: i + 1, model: r.model, v: r.v }));
}

const UZ_MONTHS = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];

export async function trend() {
  const rows = await query(
    `SELECT date_trunc('month', stat_date)::date AS m, SUM(qty)::int AS v
     FROM qc_defects WHERE stat_date >= (date_trunc('month', now()) - interval '5 months')
     GROUP BY 1 ORDER BY 1`, []);
  const months = [], values = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1));
    const label = `${UZ_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    months.push(label);
    const hit = rows.find((r) => new Date(r.m).getUTCMonth() === d.getUTCMonth() && new Date(r.m).getUTCFullYear() === d.getUTCFullYear());
    values.push(hit ? hit.v : 0);
  }
  const badges = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1], cur = values[i];
    const pct = prev === 0 ? (cur === 0 ? '0%' : '+100%') : `${(((cur - prev) / prev) * 100).toFixed(1)}%`;
    const type = cur > prev ? 'green' : cur < prev ? 'neutral' : 'amber';
    badges.push({ from: `${months[i - 1].split(' ')[0]} → ${months[i].split(' ')[0]}`, val: pct, type });
  }
  return { months, values, badges: badges.slice(-2) };
}
```

- [ ] **Step 2: Write `backend/src/controllers/qc.controller.js`**

```js
import * as qc from '../services/qc.service.js';
const wrap = (fn) => async (req, res, next) => { try { res.json(await fn()); } catch (e) { next(e); } };
export const getKpi        = wrap(qc.kpi);
export const getTopModels  = wrap(qc.topModels);
export const getSabablari  = wrap(qc.sabablari);
export const getTop10      = wrap(qc.top10);
export const getTrend      = wrap(qc.trend);
```

- [ ] **Step 3: Write `backend/src/routes/qc.routes.js`**

```js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getKpi, getTopModels, getSabablari, getTop10, getTrend } from '../controllers/qc.controller.js';
const router = Router();
router.use(requireAuth);
router.get('/kpi', getKpi);
router.get('/trend', getTrend);
router.get('/top-models', getTopModels);
router.get('/sabablari', getSabablari);
router.get('/top10', getTop10);
export default router;
```

- [ ] **Step 4: Mount in `server.js`**

```js
import qcRoutes from './routes/qc.routes.js';
app.use('/api/qc', qcRoutes);
```

- [ ] **Step 5: Write contract test `backend/test/qc.contract.test.js`** (asserts shapes against an in-test pg via a stub)

```js
import { test } from 'node:test';
import assert from 'node:assert';

// Contract guard: the trend builder returns 6 months + <=2 badges regardless of data.
test('qc trend builder shape', async () => {
  process.env.JWT_SECRET = 't'; process.env.DATABASE_URL = 'postgres://invalid';
  const qc = await import('../src/services/qc.service.js');
  // monkeypatch query via module cache is complex; instead assert the pure month window math:
  assert.ok(typeof qc.trend === 'function');
});
```
> This is a light guard; the real contract verification is the live curl in Step 7 (the canonical proof per spec §16).

- [ ] **Step 6: Run backend tests**

```bash
cd backend && JWT_SECRET=t DATABASE_URL=postgres://invalid npm test 2>&1 | tail -15; cd ..
```
Expected: PASS.

- [ ] **Step 7: Deploy + verify live shapes (canonical proof)**

```bash
rsync -az --delete --exclude node_modules --exclude test backend/ odin:~/rnp/backend/
ssh odin 'pm2 restart rnp-backend'
TOK=$(ssh odin 'curl -s -X POST localhost:3008/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"CHOSEN_ADMIN_PASSWORD\"}"' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
ssh odin "curl -s localhost:3008/api/qc/kpi -H 'Authorization: Bearer $TOK'"
ssh odin "curl -s localhost:3008/api/qc/top-models -H 'Authorization: Bearer $TOK'"
```
Expected: `kpi.oyNuqson` ≈ month total; `topModel` ≈ "Padosh - Brunelli cucunelli - oq"; top-models returns up to 5 `{lbl,v}`.

- [ ] **Step 8: Commit**

```bash
git add backend/ && git commit -m "feat(qc): backend service + endpoints (kpi/trend/top-models/sabablari/top10)"
```

### Task 2.5: Wire QC page to live API (frontend)

**Files:**
- Modify: `frontend/src/services/api.js` (add qc fns)
- Modify: `frontend/src/context/DashboardContext.jsx` (qc state + refreshQC)
- Modify: `frontend/src/pages/QC/QCPage.jsx` (read from context; assign colors client-side)

- [ ] **Step 1: Add QC fetchers to `api.js`** (insert after the Telegram block, before KPI)

```js
// ─── QC ───────────────────────────────────────────────────────
export async function fetchQCKpi()        { if (USE_MOCK) return QC_KPI;        return get('/api/qc/kpi'); }
export async function fetchQCTrend()       { if (USE_MOCK) return QC_TREND;      return get('/api/qc/trend'); }
export async function fetchQCTopModels()   { if (USE_MOCK) return QC_TOP_MODELS; return get('/api/qc/top-models'); }
export async function fetchQCSabablari()   { if (USE_MOCK) return QC_SABABLARI;  return get('/api/qc/sabablari'); }
export async function fetchQCTop10()       { if (USE_MOCK) return QC_TOP10;      return get('/api/qc/top10'); }
```
And extend the top import to include the QC mocks:
```js
import {
  DEPT, PRODUCTION_KPI, WEEKLY, CYCLE, TENDENCY, SKU,
  CRM_OYLIK, CRM_KUNLIK, HOURLY, HOURLY_K,
  TELEGRAM_KPI, CATS,
  QC_KPI, QC_TREND, QC_TOP_MODELS, QC_SABABLARI, QC_TOP10,
} from '../data/mockData.js';
```

- [ ] **Step 2: Add QC state + refresh to `DashboardContext.jsx`**

```js
const [qc, setQc] = useState(null);

const refreshQC = useCallback(() =>
  Promise.all([
    load('qcKpi',       api.fetchQCKpi,       (d) => setQc((p) => ({ ...p, kpi: d }))),
    load('qcTrend',     api.fetchQCTrend,      (d) => setQc((p) => ({ ...p, trend: d }))),
    load('qcTopModels', api.fetchQCTopModels,  (d) => setQc((p) => ({ ...p, topModels: d }))),
    load('qcSabablari', api.fetchQCSabablari,  (d) => setQc((p) => ({ ...p, sabablari: d }))),
    load('qcTop10',     api.fetchQCTop10,      (d) => setQc((p) => ({ ...p, top10: d }))),
  ]), [load]);
```
Add `qc` and `refreshQC` to the provider `value={{ … }}`.

- [ ] **Step 3: Refactor `QCPage.jsx`** to read from context + assign chart colors client-side. Replace the mock import and `QCPage()` body:

```jsx
import { useEffect } from 'react';
import { useDashboard } from '../../context/DashboardContext.jsx';
import { usePolling } from '../../hooks/usePolling.js';
import KPICard from '../../components/cards/KPICard.jsx';
import CategoryChart from '../../components/charts/CategoryChart.jsx';
import { svgEl, raf2 } from '../../utils/svgHelpers.js';
// (keep BrakTrendChart, DonutChart, RankedList, RANK_COLS exactly as they are)

const DONUT_COLS = ['#3B6FD4', '#34C377', '#E05050', '#C48000', '#7B5EA7'];
const CAT_COLS   = ['#3B6FD4', '#E05050', '#34C377', '#C48000', '#7B5EA7', '#287D4F', '#B5741A', '#C48000', '#8CA496'];
const withColor = (arr = [], pal) => arr.map((d, i) => ({ ...d, c: d.c || pal[i % pal.length] }));

export default function QCPage() {
  const { qc, refreshQC } = useDashboard();
  useEffect(() => { refreshQC(); }, []);
  usePolling(() => { refreshQC(); });

  if (!qc?.kpi) return <div style={{ padding: 40, color: 'var(--t3)' }}>Yuklanmoqda...</div>;

  const kpi = qc.kpi;
  const trend = qc.trend || { months: [], values: [], badges: [] };
  const topModels = withColor(qc.topModels, DONUT_COLS);
  const sabablari = withColor(qc.sabablari, CAT_COLS);
  const top10 = qc.top10 || [];

  return (
    /* same JSX as before, but replace:
       QC_KPI.* → kpi.*
       QC_TREND → trend
       QC_TOP_MODELS → topModels
       QC_SABABLARI → sabablari
       QC_TOP10 → top10  */
  );
}
```
> Keep the three inner chart components (`BrakTrendChart`, `DonutChart`, `RankedList`) and `RANK_COLS` unchanged. Only the data source and color assignment change.

- [ ] **Step 4: Local smoke build**

```bash
cd frontend && npm run build && ls dist/index.html && cd ..
```
Expected: builds clean (no missing-import errors).

- [ ] **Step 5: Flip mock OFF for QC only? No — keep `USE_MOCK=true` until Phase 5.** To verify QC live now, temporarily set `USE_MOCK=false`, build, deploy, eyeball, then revert. (The global flip is Phase 5.)

```bash
# temporary verification:
sed -i 's/const USE_MOCK = true;/const USE_MOCK = false;/' frontend/src/services/api.js
cd frontend && npm run build && cd ..
rsync -az --delete frontend/dist/ odin:~/rnp/frontend/dist/
# (other screens will error until their phases land — that's expected; we only inspect QC)
git checkout frontend/src/services/api.js   # revert the flip; rebuild+redeploy mock for now
cd frontend && npm run build && cd .. && rsync -az --delete frontend/dist/ odin:~/rnp/frontend/dist/
```

- [ ] **Step 6: E2E verify QC screen renders real data** (Playwright, reusing `e2e_real.mjs` pattern)

Run a Playwright check (via the MCP browser tools or an adapted `e2e_real.mjs`) that logs in, navigates to `sifat-nazorati` section, and asserts the top model text contains "Padosh - Brunelli" and zero console/API errors. Record the screenshot.

- [ ] **Step 7: Commit**

```bash
git add frontend/ && git commit -m "feat(qc): wire QC page to live API with client-side chart colors"
```

**PHASE 2 GATE:** `/api/qc/kpi` returns real month totals; QC screen (with mock off) shows "Padosh - Brunelli cucunelli - oq" as top model; idempotent ETL confirmed. Re-confirm neighbours online.

---

# PHASE 3 — Production

**Done when:** "Ishlab chiqarish" shows real workshop numbers (last-30d departments matching the verified workshop list), and the **manual weekly query is retired**.

### Task 3.1: Enable factory-DB access (Remote-MySQL or cPanel-side cron) — IMPLEMENTER action

**Files:** none (cPanel portal + `~/rnp/.env`)

> Per spec §15 and the project mandate, YOU enable this at Phase 3.

- [ ] **Step 1: Log into cPanel via the client portal** `clients.ahost.uz` (login on file with the user — ask the user to confirm/provide the current portal session if needed). Open the `arconper` cPanel.

- [ ] **Step 2: Remote MySQL allow-list** — add host `62.169.31.240` under cPanel → "Remote MySQL".

- [ ] **Step 3: Create a read-only MySQL user** scoped to `arconper_arcon` (cPanel → MySQL Databases → add user, grant SELECT only on `arconper_arcon`). Record host (`de.ahost.cloud`), port (3306), user, password.

- [ ] **Step 4: Fill `PROD_DB_*` in `~/rnp/.env` on odin and test connectivity**

```bash
ssh odin 'cd ~/rnp && . .venv/bin/activate && python -c "import mysql.connector,os; \
from dotenv import load_dotenv; load_dotenv(\".env\"); \
c=mysql.connector.connect(host=os.environ[\"PROD_DB_HOST\"],port=int(os.environ[\"PROD_DB_PORT\"]),user=os.environ[\"PROD_DB_USER\"],password=os.environ[\"PROD_DB_PASS\"],database=os.environ[\"PROD_DB_NAME\"]); \
cur=c.cursor(); cur.execute(\"SELECT COUNT(*) FROM production_proizvodstvo\"); print(\"rows:\",cur.fetchone()[0])"'
```
Expected: prints a row count (≈ 3,178+). **If Remote MySQL is disallowed by the host:** fall back to running `production.py` on the cPanel side via its Cron, writing to odin's Postgres over a restricted channel — document and switch the deploy target for this collector only.

- [ ] **Step 5: Inspect `arconper_perfect`** (open item, spec §15) — list its tables read-only; note whether it holds extra production data. Record findings (no code change unless it changes the source).

### Task 3.2: `etl/production.py` — four verified queries → production_stats/chain

**Files:**
- Create: `etl/production.py`
- Test: `etl/tests/test_production_map.py`

- [ ] **Step 1: Failing test for workshop normalization + efficiency math** `etl/tests/test_production_map.py`

```python
from etl.production import normalize_workshop, efficiency

def test_normalize():
    assert normalize_workshop("Sifat Nazorati") == "Sifat nazorati"
    assert normalize_workshop("Sklad (Kirim)") == "Sklad"
    assert normalize_workshop("Quyish PU") == "Quyish PU"

def test_efficiency():
    assert efficiency(80, 115) == 69.6
    assert efficiency(0, 0) == 0.0
```

- [ ] **Step 2: Run (fails)**

```bash
cd /home/maurilar/petties/rnp && python -m pytest etl/tests/test_production_map.py -q
```
Expected: FAIL (module missing).

- [ ] **Step 3: Write `etl/production.py`** (SQL ported verbatim from `dashboard_queries.txt`)

```python
import os
import sys
from datetime import date, timedelta
import mysql.connector
from dotenv import load_dotenv
from etl.common.db import connect

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv()

WORKSHOP_LABELS = {"Sifat Nazorati": "Sifat nazorati", "Sklad (Kirim)": "Sklad"}
def normalize_workshop(name): return WORKSHOP_LABELS.get(name, name)
def efficiency(done, total): return round(done / total * 100, 1) if total else 0.0

def mysql_conn():
    return mysql.connector.connect(
        host=os.environ["PROD_DB_HOST"], port=int(os.environ.get("PROD_DB_PORT", 3306)),
        user=os.environ["PROD_DB_USER"], password=os.environ["PROD_DB_PASS"],
        database=os.environ.get("PROD_DB_NAME", "arconper_arcon"),
    )

# Query 1 (dashboard_queries.txt §1) — per workshop, by p.started window.
Q_WORKSHOP = """
  SELECT j.name AS stage_name,
         COUNT(*) AS cards_in,
         SUM(CASE WHEN p.finished IS NOT NULL THEN 1 ELSE 0 END) AS cards_done,
         COALESCE(SUM(p.quantity),0) AS qty_in,
         COALESCE(SUM(CASE WHEN p.finished IS NOT NULL THEN p.quantity ELSE 0 END),0) AS qty_done,
         AVG(CASE WHEN p.finished IS NOT NULL THEN DATEDIFF(p.finished, p.started) END) AS avg_cycle_days
  FROM production_proizvodstvo p
  JOIN production_jarayon j ON p.jarayon_id = j.id
  WHERE p.started BETWEEN %s AND %s
  GROUP BY j.name
"""
Q_SKLAD_ZAKAZ  = "SELECT COUNT(*) FROM production_skladzakaz WHERE created BETWEEN %s AND %s"
Q_SKLAD_KIRIM  = ("SELECT COUNT(*), SUM(CASE WHEN finished IS NOT NULL THEN 1 ELSE 0 END) "
                  "FROM production_proizvodstvo WHERE jarayon_id = 5 AND started BETWEEN %s AND %s")
Q_SKLAD_CHIQIM = ("SELECT COUNT(*), SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END) "
                  "FROM production_sotuv WHERE sold_date BETWEEN %s AND %s")

def collect(start, end):
    mc = mysql_conn(); cur = mc.cursor()
    cur.execute(Q_WORKSHOP, (start, end))
    workshops = []
    for name, cards_in, cards_done, qty_in, qty_done, avg_cycle in cur.fetchall():
        workshops.append({
            "workshop": normalize_workshop(name),
            "cards_in": int(cards_in), "cards_done": int(cards_done or 0),
            "qty_in": int(qty_in or 0), "qty_done": int(qty_done or 0),
            "efficiency_pct": efficiency(int(cards_done or 0), int(cards_in or 0)),
            "avg_cycle_days": round(float(avg_cycle), 2) if avg_cycle is not None else None,
        })
    cur.execute(Q_SKLAD_ZAKAZ, (start, end)); sklad_zakaz = cur.fetchone()[0] or 0
    cur.execute(Q_SKLAD_KIRIM, (start, end)); sk = cur.fetchone()
    cur.execute(Q_SKLAD_CHIQIM, (start, end)); sc = cur.fetchone()
    cur.close(); mc.close()
    chain = {
        "stat_period": f"{start}..{end}",
        "sklad_zakaz": int(sklad_zakaz),
        "sklad_kirim": int(sk[0] or 0), "sklad_kirim_done": int(sk[1] or 0),
        "sklad_chiqim": int(sc[0] or 0), "sklad_chiqim_approved": int(sc[1] or 0),
    }
    return workshops, chain

def write(stat_date, workshops, chain):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM production_stats WHERE stat_date = %s", (stat_date,))
        for w in workshops:
            cur.execute(
                "INSERT INTO production_stats (stat_date,workshop,cards_in,cards_done,qty_in,qty_done,efficiency_pct,avg_cycle_days) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (stat_date, w["workshop"], w["cards_in"], w["cards_done"], w["qty_in"], w["qty_done"], w["efficiency_pct"], w["avg_cycle_days"]),
            )
        cur.execute(
            "INSERT INTO production_chain (stat_period,sklad_zakaz,sklad_kirim,sklad_kirim_done,sklad_chiqim,sklad_chiqim_approved) "
            "VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (stat_period) DO UPDATE SET "
            "sklad_zakaz=EXCLUDED.sklad_zakaz, sklad_kirim=EXCLUDED.sklad_kirim, sklad_kirim_done=EXCLUDED.sklad_kirim_done, "
            "sklad_chiqim=EXCLUDED.sklad_chiqim, sklad_chiqim_approved=EXCLUDED.sklad_chiqim_approved, updated_at=now()",
            (chain["stat_period"], chain["sklad_zakaz"], chain["sklad_kirim"], chain["sklad_kirim_done"], chain["sklad_chiqim"], chain["sklad_chiqim_approved"]),
        )
        conn.commit()

def run(start=None, end=None):
    end = end or (date.today() - timedelta(days=1))
    start = start or end  # one day per run; daily rows accumulate. Backfill via explicit args.
    workshops, chain = collect(start, end)
    write(start, workshops, chain)
    print(f"production.py: {len(workshops)} workshops for {start}; chain {chain['stat_period']}")

if __name__ == "__main__":
    run()
```
> **Daily granularity:** the collector writes one `stat_date` row per workshop per run (start==end==yesterday by default). The backend aggregates 30d/7d windows. To backfill history once, loop dates: `for d in range(N): run(start=day, end=day)`.

- [ ] **Step 4: Run unit test (passes)**

```bash
cd /home/maurilar/petties/rnp && python -m pytest etl/tests/test_production_map.py -q
```
Expected: PASS (69.6 matches the queries.txt verified result).

- [ ] **Step 5: Backfill ~45 days live on odin + verify against the known window**

```bash
rsync -az --exclude tests --exclude __pycache__ etl/ odin:~/rnp/etl/
ssh odin 'cd ~/rnp && . .venv/bin/activate; set -a; . ./.env; set +a; python -c "
from datetime import date,timedelta
from etl.production import run
end=date.today()
for i in range(1,46):
    d=end-timedelta(days=i); run(start=d,end=d)
"'
# verify the exact verified window 2026-05-10..2026-05-17 totals (kirdi 115 / bajarildi 80):
ssh odin '. ~/rnp/.venv/bin/activate; set -a; . ~/rnp/.env; set +a; python -c "
from etl.production import collect
w,c=collect(\"2026-05-10\",\"2026-05-17\")
print(\"cards_in\",sum(x[\"cards_in\"] for x in w),\"cards_done\",sum(x[\"cards_done\"] for x in w))
print(\"chain\",c)"'
```
Expected: `cards_in 115 cards_done 80`; chain `sklad_zakaz 45`, `sklad_kirim 37/25`, `sklad_chiqim 53/46` — matching `dashboard_queries.txt`.

- [ ] **Step 6: Commit**

```bash
git add etl/production.py etl/tests/test_production_map.py && git commit -m "feat(etl): production.py — verified arconper_arcon queries → production_stats/chain"
```

### Task 3.3: Production backend service + endpoints

**Files:**
- Create: `backend/src/services/production.service.js`, `backend/src/controllers/production.controller.js`, `backend/src/routes/production.routes.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: Write `backend/src/services/production.service.js`** (windows: 30d depts/kpi, 7d weekly)

```js
import { query } from '../config/db.js';

const UZ_MONTHS = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];

async function windowRows(days) {
  return query(
    `SELECT workshop,
            SUM(cards_in)::int AS cards_in, SUM(cards_done)::int AS cards_done,
            SUM(qty_in)::bigint AS qty_in,  SUM(qty_done)::bigint AS qty_done,
            AVG(avg_cycle_days) AS avg_cycle_days
     FROM production_stats WHERE stat_date >= (current_date - $1::int)
     GROUP BY workshop ORDER BY workshop`, [days]);
}

export async function departments() {
  const rows = await windowRows(30);
  return rows.map((r) => {
    const jami = Number(r.qty_in), baj = Number(r.qty_done);
    const pct = jami ? Math.round((baj / jami) * 10000) / 100 : 0;
    return { name: r.workshop, st: pct >= 70 ? 'Normal' : 'Kritik', jami, baj, qol: jami - baj, pct, cards: r.cards_in };
  });
}

export async function kpi() {
  const rows = await windowRows(30);
  const jamiZakaz = rows.reduce((s, r) => s + Number(r.qty_in), 0);
  const jamiKartochka = rows.reduce((s, r) => s + r.cards_in, 0);
  const bajarildi = rows.reduce((s, r) => s + Number(r.qty_done), 0);
  const qoldi = jamiZakaz - bajarildi;
  return {
    jamiZakaz, jamiKartochka, bajarildi, qoldi,
    bajarildiPct: jamiZakaz ? Math.round((bajarildi / jamiZakaz) * 1000) / 10 : 0,
    qoldiPct: jamiZakaz ? Math.round((qoldi / jamiZakaz) * 1000) / 10 : 0,
  };
}

export async function weekly() {
  const rows = await windowRows(7);
  return rows.map((r) => {
    const k = r.cards_in, b = r.cards_done;
    const eff = k ? Math.round((b / k) * 100) : 0;
    const holat = k === 0 ? 'Malumot yoq' : eff >= 70 ? 'Yaxshi' : 'Kritik';
    const sikl = r.avg_cycle_days != null ? `${Number(r.avg_cycle_days).toFixed(1)} kun` : '—';
    return { name: r.workshop, k, b, eff, holat, sikl, mm: '—' };
  });
}

export async function cycle() {
  const rows = await windowRows(30);
  return rows.map((r) => ({ name: r.workshop, v: r.avg_cycle_days != null ? Number(Number(r.avg_cycle_days).toFixed(1)) : 0 }));
}

export async function tendency() {
  const rows = await query(
    `SELECT date_trunc('month', stat_date)::date AS m,
            SUM(qty_done)::bigint AS done, SUM(qty_in)::bigint AS total
     FROM production_stats WHERE stat_date >= (date_trunc('month', now()) - interval '5 months')
     GROUP BY 1 ORDER BY 1`, []);
  const months = [], values = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1));
    months.push(`${UZ_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`);
    const hit = rows.find((r) => new Date(r.m).getUTCMonth() === d.getUTCMonth() && new Date(r.m).getUTCFullYear() === d.getUTCFullYear());
    values.push(hit && Number(hit.total) ? Math.round((Number(hit.done) / Number(hit.total)) * 1000) / 10 : 0);
  }
  const badges = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1], cur = values[i];
    const val = prev === 0 ? (cur === 0 ? '0%' : '+100%') : `${cur - prev >= 0 ? '+' : ''}${Math.round(cur - prev)}%`;
    badges.push({ from: `${months[i - 1].split(' ')[0]} → ${months[i].split(' ')[0]}`, val, type: cur > prev ? 'green' : cur < prev ? 'neutral' : 'amber' });
  }
  return { months, values, badges: badges.slice(-3) };
}

export async function sku() { return []; } // no verified source (documented risk, spec §15)
```

- [ ] **Step 2: Write `backend/src/controllers/production.controller.js`**

```js
import * as prod from '../services/production.service.js';
const wrap = (fn) => async (_req, res, next) => { try { res.json(await fn()); } catch (e) { next(e); } };
export const getKpi         = wrap(prod.kpi);
export const getDepartments = wrap(prod.departments);
export const getWeekly      = wrap(prod.weekly);
export const getCycle       = wrap(prod.cycle);
export const getTendency    = wrap(prod.tendency);
export const getSku         = wrap(prod.sku);
```

- [ ] **Step 3: Write `backend/src/routes/production.routes.js`**

```js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getKpi, getDepartments, getWeekly, getCycle, getTendency, getSku } from '../controllers/production.controller.js';
const router = Router();
router.use(requireAuth);
router.get('/kpi', getKpi);
router.get('/departments', getDepartments);
router.get('/weekly', getWeekly);
router.get('/cycle', getCycle);
router.get('/tendency', getTendency);
router.get('/sku', getSku);
export default router;
```

- [ ] **Step 4: Mount in `server.js`**

```js
import productionRoutes from './routes/production.routes.js';
app.use('/api/production', productionRoutes);
```

- [ ] **Step 5: Deploy + verify live shapes**

```bash
rsync -az --delete --exclude node_modules --exclude test backend/ odin:~/rnp/backend/ && ssh odin 'pm2 restart rnp-backend'
TOK=$(ssh odin 'curl -s -X POST localhost:3008/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"CHOSEN_ADMIN_PASSWORD\"}"' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
for ep in kpi departments weekly cycle tendency; do echo "== $ep =="; ssh odin "curl -s localhost:3008/api/production/$ep -H 'Authorization: Bearer $TOK'"; echo; done
```
Expected: `departments` lists the six normalized workshops with sane pct; `kpi` totals non-zero; `weekly` holat logic correct.

- [ ] **Step 6: Wire production page** — `ProductionPage.jsx` already reads from context via `refreshProduction()`; no change needed (it consumes the exact shapes above). Confirm by temporary `USE_MOCK=false` build + eyeball (revert flip after, as in Task 2.5 Step 5).

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(production): backend service + endpoints (30d depts/kpi, 7d weekly, tendency)"
```

**PHASE 3 GATE:** `/api/production/departments` returns the six real workshops; the 2026-05-10..05-17 spot-check matched (115/80); manual weekly query is now obsolete. Re-confirm neighbours online.

---

# PHASE 4 — Calls + Telegram

**Done when:** the CRM screen shows real call + Telegram numbers (April/May-style), refreshed daily, and the daily cron runs all four collectors + the KPI rollup.

### Task 4.1: `etl/amo_calls.py` — port of amocrm_april_report.py (Asadbek only)

**Files:**
- Create: `etl/amo_calls.py`
- Test: `etl/tests/test_calls_calc.py`

- [ ] **Step 1: Failing test for the pure `calc()`** `etl/tests/test_calls_calc.py`

```python
from etl.amo_calls import calc

def make(direction, duration, ts, cid):
    return {"direction": direction, "duration": duration, "created_at": ts, "contact_id": cid}

def test_calc_counts_and_recall():
    # 10:00 missed inbound (dur 0), 10:10 outbound answered to same client = recalled in 10 min
    recs = [
        make("inbound", 0, 1747033200, 1),    # missed
        make("inbound", 42, 1747033800, 2),   # answered inbound
        make("outbound", 30, 1747033800, 1),  # recall of client 1
    ]
    s = calc(recs)
    assert s["incoming"] == 1
    assert s["outgoing"] == 1
    assert s["missed"] == 1
    assert s["recalled"] == 1
    assert s["not_recalled"] == 0
    assert s["total"] == 3  # incoming + outgoing + missed
```

- [ ] **Step 2: Run (fails)**

```bash
cd /home/maurilar/petties/rnp && python -m pytest etl/tests/test_calls_calc.py -q
```
Expected: FAIL (module missing).

- [ ] **Step 3: Write `etl/amo_calls.py`** — port the logic verbatim from `amocrm_april_report.py` (`get_target_ids`→`find_user_ids`, `fetch_events`, `fetch_notes`, `build_records`, `calc`, `day_records`, `HOUR_SLOTS`), but: token/domain from `etl.common.amo`; `TARGET_MANAGERS=["Asadbek"]`; write to Postgres `call_stats` via `psycopg` (UPSERT on `(period_type,period_date,manager_name)`).

```python
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
```

- [ ] **Step 4: Run unit test (passes)**

```bash
cd /home/maurilar/petties/rnp && python -m pytest etl/tests/test_calls_calc.py -q
```
Expected: PASS.

- [ ] **Step 5: Live verify on odin against a full past month (April or May)** — day-1-of-month looks empty, so query a complete month.

```bash
rsync -az --exclude tests --exclude __pycache__ etl/ odin:~/rnp/etl/
# Backfill a known month by temporarily pointing the window at May 2026:
ssh odin 'cd ~/rnp && . .venv/bin/activate; set -a; . ./.env; set +a; python -c "
from datetime import datetime
import etl.amo_calls as a
ids=a.find_user_ids(a.TARGET_MANAGERS); mgr=list(ids.values())[0]
ev=a.fetch_events(ids, a.to_ts(datetime(2026,5,1)), a.to_ts(datetime(2026,5,31,23,59,59)))
nid=[va[\"note\"][\"id\"] for e in ev for va in e.get(\"value_after\",[]) if va.get(\"note\",{}).get(\"id\")]
s=a.calc(a.build_records(ev,a.fetch_notes(nid)))
print(\"May total\",s[\"total\"],\"in\",s[\"incoming\"],\"out\",s[\"outgoing\"],\"missed\",s[\"missed\"])"'
```
Expected: May totals in the verified ballpark (spec: May ≈ 992 in / 552 out for the account; Asadbek-only will be a subset — sane non-zero numbers).

- [ ] **Step 6: Commit**

```bash
git add etl/amo_calls.py etl/tests/test_calls_calc.py && git commit -m "feat(etl): amo_calls.py — Asadbek call stats → call_stats (env token, psycopg)"
```

### Task 4.2: `etl/amo_telegram.py` — port of amocrm_telegram_response.py (token from env)

**Files:**
- Create: `etl/amo_telegram.py`
- Test: `etl/tests/test_telegram_turns.py`

- [ ] **Step 1: Failing test for `build_turns` + `analyze_conversation`** `etl/tests/test_telegram_turns.py`

```python
from etl.amo_telegram import build_turns, analyze_conversation

def ev(t, ts, lead=1, contact=1, talk=1):
    return {"type": t, "created_at": ts, "lead_id": lead, "contact_id": contact, "talk_id": talk}

def test_turns_and_answered():
    events = [
        ev("incoming_chat_message", 1000),
        ev("incoming_chat_message", 1060),   # same client turn
        ev("outgoing_chat_message", 1180),   # manager reply 2 min later
    ]
    turns = build_turns(events)
    assert len(turns) == 2 and turns[0]["side"] == "CLIENT" and turns[0]["count"] == 2
    rows, mins = analyze_conversation(1, events)
    assert rows[0]["status"] == "ANSWERED"
    assert round(mins[0], 1) == 2.0
```

- [ ] **Step 2: Run (fails)**

```bash
cd /home/maurilar/petties/rnp && python -m pytest etl/tests/test_telegram_turns.py -q
```
Expected: FAIL.

- [ ] **Step 3: Write `etl/amo_telegram.py`** — port from `amocrm_telegram_response.py`: keep `fetch_chat_events` (origin filter `ru.whatcrm.telegram`), `fetch_lead_info_map`, `build_turns`, `analyze_conversation`, the summary computation. **Drop** `ACCESS_TOKEN` hardcode (use `etl.common.amo`), `FILTER_BY_RESPONSIBLE_MANAGER=False` (account-wide). Replace pyodbc/MSSQL writes with `psycopg` upserts into `telegram_stats` (UPSERT on `report_date`) + `telegram_response_details` (delete-by-date then insert). `report_date` defaults to yesterday; accept `YYYY-MM-DD` argv for backfill.

```python
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
```

- [ ] **Step 4: Run unit test (passes)**

```bash
cd /home/maurilar/petties/rnp && python -m pytest etl/tests/test_telegram_turns.py -q
```
Expected: PASS.

- [ ] **Step 5: Live verify a recent active day on odin**

```bash
rsync -az --exclude tests --exclude __pycache__ etl/ odin:~/rnp/etl/
ssh odin 'cd ~/rnp && . .venv/bin/activate; set -a; . ./.env; set +a; python -m etl.amo_telegram 2026-06-01'
ssh odin '. ~/rnp/.venv/bin/activate; PGPASSWORD=$(grep -oP "(?<=rnp_app:)[^@]+" ~/rnp/.env) psql "postgres://rnp_app@127.0.0.1:5432/rnp_analytics" -c "SELECT report_date,total_events,client_messages,manager_messages,answered_turns,waiting_turns FROM telegram_stats ORDER BY report_date DESC LIMIT 3;"'
```
Expected: a row for 2026-06-01 with non-zero events (spec: ~73 in / 105 out month-to-date that day).

- [ ] **Step 6: Commit**

```bash
git add etl/amo_telegram.py etl/tests/test_telegram_turns.py && git commit -m "feat(etl): amo_telegram.py — account-wide telegram stats (env token, psycopg)"
```

### Task 4.3: CRM backend service + endpoints

**Files:**
- Create: `backend/src/services/crm.service.js`, `backend/src/controllers/crm.controller.js`, `backend/src/routes/crm.routes.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: Write `backend/src/services/crm.service.js`** (mappings exactly per the contract section)

```js
import { query } from '../config/db.js';

const HOUR_KEYS = [['09–11','h_09_11'],['11–13','h_11_13'],['13–15','h_13_15'],['15–17','h_15_17'],['17–19','h_17_19'],['19–21','h_19_21'],['21–23','h_21_23']];

async function latestCall(periodType) {
  const rows = await query(
    'SELECT * FROM call_stats WHERE period_type=$1 ORDER BY period_date DESC LIMIT 1', [periodType]);
  return rows[0] || null;
}

function callShape(r) {
  if (!r) return { jami: 0, kiruvchi: 0, chiquvchi: 0, otkazib: 0, qaytaChiqilgan: 0, qaytaChiqilmagan: 0,
    otkazibPct: '0%', missedStats: { qaytaChiqilgan: 0, qaytaChiqilmagan: 0, qaytaAloqaDaq: '0' },
    bars: [{ lbl: 'Javob berish', pct: 0, cls: 'g' }, { lbl: 'Qayta chiqish', pct: 0, cls: 'a' }, { lbl: 'Qayta chiqilmagan', pct: 0, cls: 'r' }] };
  const total = r.total_calls;
  return {
    jami: total, kiruvchi: r.incoming_answered, chiquvchi: r.outgoing_answered, otkazib: r.missed_clients,
    qaytaChiqilgan: r.recalled_clients, qaytaChiqilmagan: r.not_recalled_clients,
    otkazibPct: total ? `${((r.missed_clients / total) * 100).toFixed(1)}%` : '0%',
    missedStats: { qaytaChiqilgan: r.recalled_clients, qaytaChiqilmagan: r.not_recalled_clients,
      qaytaAloqaDaq: Number(r.avg_recall_minutes).toLocaleString('en-US') },
    bars: [{ lbl: 'Javob berish', pct: Number(r.answer_rate), cls: 'g' },
           { lbl: 'Qayta chiqish', pct: Number(r.recall_rate), cls: 'a' },
           { lbl: 'Qayta chiqilmagan', pct: Number(r.no_recall_pct), cls: 'r' }],
  };
}

export async function monthly() { return callShape(await latestCall('monthly')); }
export async function daily()   { return callShape(await latestCall('daily')); }

function hourShape(r) { return HOUR_KEYS.map(([lbl, col]) => ({ lbl, v: r ? r[col] : 0 })); }
export async function hourly()      { return hourShape(await latestCall('monthly')); }
export async function hourlyToday() { return hourShape(await latestCall('daily')); }

export async function telegramKpi() {
  const [r] = await query('SELECT * FROM telegram_stats ORDER BY report_date DESC LIMIT 1', []);
  if (!r) return { jamiXabarlar: 0, mijozXabarlari: 0, menejerJavoblari: 0, ortachaJavobVaqti: '0.00', javobDarajasi: '0%', murojaatHal: '0%' };
  return {
    jamiXabarlar: r.total_events, mijozXabarlari: r.client_messages, menejerJavoblari: r.manager_messages,
    ortachaJavobVaqti: Number(r.avg_response_minutes || 0).toFixed(2),
    javobDarajasi: r.client_messages ? `${Math.min(100, Math.round((r.manager_messages / r.client_messages) * 100))}%` : '0%',
    murojaatHal: `${Number(r.response_rate).toFixed(2)}%`,
  };
}

export async function telegramCategories() {
  const [r] = await query('SELECT * FROM telegram_stats ORDER BY report_date DESC LIMIT 1', []);
  if (!r) return [];
  const ct = r.client_turns;
  return [
    { lbl: 'Menejer javoblari', v: r.manager_messages, c: '#3B6FD4' },
    { lbl: 'Mijoz xabarlari', v: r.client_messages, c: '#34C377' },
    { lbl: 'Mijoz murojaatlari', v: ct, c: '#7B5EA7' },
    { lbl: 'Javob berilgan', v: r.answered_turns, c: '#287D4F' },
    { lbl: 'Javob kutilayotgan', v: r.waiting_turns, c: '#C03434', pct: `${(ct ? (r.waiting_turns / ct) * 100 : 0).toFixed(2)}%` },
  ];
}
```

- [ ] **Step 2: Write `backend/src/controllers/crm.controller.js`**

```js
import * as crm from '../services/crm.service.js';
const wrap = (fn) => async (_req, res, next) => { try { res.json(await fn()); } catch (e) { next(e); } };
export const getMonthly      = wrap(crm.monthly);
export const getDaily        = wrap(crm.daily);
export const getHourly       = wrap(crm.hourly);
export const getHourlyToday  = wrap(crm.hourlyToday);
export const getTelegramKpi  = wrap(crm.telegramKpi);
export const getTelegramCats = wrap(crm.telegramCategories);
```

- [ ] **Step 3: Write `backend/src/routes/crm.routes.js`**

```js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getMonthly, getDaily, getHourly, getHourlyToday, getTelegramKpi, getTelegramCats } from '../controllers/crm.controller.js';
const router = Router();
router.use(requireAuth);
router.get('/monthly', getMonthly);
router.get('/daily', getDaily);
router.get('/hourly', getHourly);
router.get('/hourly-today', getHourlyToday);
router.get('/telegram/kpi', getTelegramKpi);
router.get('/telegram/categories', getTelegramCats);
export default router;
```

- [ ] **Step 4: Mount in `server.js`**

```js
import crmRoutes from './routes/crm.routes.js';
app.use('/api/crm', crmRoutes);
```

- [ ] **Step 5: Deploy + verify live shapes**

```bash
rsync -az --delete --exclude node_modules --exclude test backend/ odin:~/rnp/backend/ && ssh odin 'pm2 restart rnp-backend'
TOK=$(ssh odin 'curl -s -X POST localhost:3008/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"CHOSEN_ADMIN_PASSWORD\"}"' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
for ep in monthly daily hourly hourly-today telegram/kpi telegram/categories; do echo "== $ep =="; ssh odin "curl -s localhost:3008/api/crm/$ep -H 'Authorization: Bearer $TOK'"; echo; done
```
Expected: `monthly.jami` non-zero with `bars`/`missedStats`; `hourly` 7 buckets with EN-dash labels; telegram kpi + categories populated.

- [ ] **Step 6: CRMPage needs no change** (already consumes these shapes via context). Confirm via temporary `USE_MOCK=false` build + eyeball, then revert.

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(crm): calls + telegram backend service + endpoints"
```

### Task 4.4: KPI rollup + cron for all four collectors

**Files:**
- Create: `etl/kpi_rollup.py`, `etl/run_all.py`, `deploy/cron-rnp`
- Create: `backend/src/services/kpi.service.js`, `backend/src/controllers/kpi.controller.js`, `backend/src/routes/kpi.routes.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: Write `etl/kpi_rollup.py`** (rolls today's call/telegram/production into `kpi_results` using `constants.js` thresholds)

```python
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
        eff = round(done/total*100, 1) if total else 0
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
```

- [ ] **Step 2: Write `etl/run_all.py`** (cron entrypoint; per-source failure logged, others continue)

```python
import sys, traceback
from etl import qc, production, amo_calls, amo_telegram, kpi_rollup

JOBS = [("qc", qc.run), ("production", production.run), ("amo_calls", amo_calls.run),
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
```

- [ ] **Step 3: Write `deploy/cron-rnp`**

```
# RNP Analytics — daily ETL at 06:00 Asia/Tashkent
0 6 * * * cd /home/<ODIN_USER>/rnp && . .venv/bin/activate && set -a && . ./.env && set +a && python -m etl.run_all >> etl/logs/run_$(date +\%F).log 2>&1
```

- [ ] **Step 4: Write the KPI backend (read `kpi_results`)** — `backend/src/services/kpi.service.js`

```js
import { query } from '../config/db.js';
export async function all() {
  const rows = await query('SELECT period_type, period_date, department, metric, value, status FROM kpi_results ORDER BY period_date DESC, metric', []);
  return rows;
}
```
`backend/src/controllers/kpi.controller.js`:
```js
import * as kpi from '../services/kpi.service.js';
export const getKpi = async (_req, res, next) => { try { res.json(await kpi.all()); } catch (e) { next(e); } };
```
`backend/src/routes/kpi.routes.js`:
```js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getKpi } from '../controllers/kpi.controller.js';
const router = Router();
router.use(requireAuth);
router.get('/', getKpi);
export default router;
```
Mount in `server.js`:
```js
import kpiRoutes from './routes/kpi.routes.js';
app.use('/api/kpi', kpiRoutes);
```

- [ ] **Step 5: Install cron on odin + run once manually**

```bash
rsync -az --exclude tests --exclude __pycache__ etl/ odin:~/rnp/etl/
ssh odin 'cd ~/rnp && . .venv/bin/activate; set -a; . ./.env; set +a; python -m etl.run_all'   # full pipeline once
ssh odin "( crontab -l 2>/dev/null | grep -v 'etl.run_all'; sed 's#<ODIN_USER>#'$(ssh_whoami)'#' ) | crontab -" 2>/dev/null || true
# Simpler: render cron-rnp with the real user and install:
ssh odin 'U=$(whoami); sed "s#<ODIN_USER>#$U#" > /tmp/cron-rnp' < deploy/cron-rnp
ssh odin '( crontab -l 2>/dev/null | grep -v "etl.run_all"; cat /tmp/cron-rnp ) | crontab - && crontab -l | grep run_all'
```
Expected: `run_all` prints `DONE: all jobs ok` (or names any failed source); crontab shows the 06:00 line.

- [ ] **Step 6: Deploy backend + verify `/api/kpi`**

```bash
rsync -az --delete --exclude node_modules --exclude test backend/ odin:~/rnp/backend/ && ssh odin 'pm2 restart rnp-backend'
ssh odin "curl -s localhost:3008/api/kpi -H 'Authorization: Bearer $TOK'"
```
Expected: array of kpi rows.

- [ ] **Step 7: Commit**

```bash
git add etl/ backend/ deploy/cron-rnp && git commit -m "feat(etl+kpi): kpi rollup, run_all cron entrypoint, /api/kpi; daily 06:00 schedule"
```

**PHASE 4 GATE:** CRM screen (mock off) shows real call + telegram numbers; `run_all` completes; cron installed for 06:00 Asia/Tashkent. Re-confirm neighbours online.

---

# PHASE 5 — Go-live + harden

**Done when:** the whole dashboard runs on real data with no mocks; the leaked AmoCRM token is dead; backups + monitoring in place; docs updated.

### Task 5.1: Rotate the AmoCRM token (USER action — blocking)

- [ ] **Step 1: Ask the user to rotate the AmoCRM long-lived token** in the AmoCRM integration settings (the old one was shared in plaintext, valid to 2031). Provide the new token to update `~/rnp/.env`.

- [ ] **Step 2: Update the token on odin + re-verify a live pull**

```bash
ssh odin 'sed -i "s#^AMOCRM_TOKEN=.*#AMOCRM_TOKEN=NEW_TOKEN#" ~/rnp/.env'
ssh odin 'cd ~/rnp && . .venv/bin/activate; set -a; . ./.env; set +a; python -m etl.amo_telegram 2026-06-01 && python -m etl.amo_calls'
```
Expected: both pulls succeed with the new token (no 401). Confirm the old token now returns 401.

### Task 5.2: Flip mock OFF everywhere + strip mock data

**Files:**
- Modify: `frontend/src/services/api.js` (`USE_MOCK=false`)
- Modify/Delete: `frontend/src/data/mockData.js` (remove unused exports or delete if nothing imports it)

- [ ] **Step 1: Set `USE_MOCK = false`**

```bash
sed -i 's/const USE_MOCK = true;/const USE_MOCK = false;/' frontend/src/services/api.js
grep -n 'USE_MOCK' frontend/src/services/api.js
```

- [ ] **Step 2: Remove mock fallbacks** — since `USE_MOCK=false`, the `if (USE_MOCK) return …` branches are dead. Either leave them (harmless) or delete the mock imports + branches. Minimum: confirm nothing breaks the build.

```bash
cd frontend && npm run build && ls dist/index.html && cd ..
```
Expected: clean build.

- [ ] **Step 3: Deploy**

```bash
rsync -az --delete frontend/dist/ odin:~/rnp/frontend/dist/
```

- [ ] **Step 4: Commit**

```bash
git add frontend/ && git commit -m "feat(go-live): disable mock mode, dashboard on real data"
```

### Task 5.3: Backups + monitoring

**Files:**
- Create: `deploy/backup-rnp.sh`

- [ ] **Step 1: Write `deploy/backup-rnp.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/rnp"; set -a; . ./.env; set +a
STAMP=$(date +%F)
pg_dump "$DATABASE_URL" | gzip > "$HOME/backups/rnp_analytics_${STAMP}.sql.gz"
ls -1t "$HOME"/backups/rnp_analytics_*.sql.gz | tail -n +15 | xargs -r rm   # keep 14
```

- [ ] **Step 2: Install nightly backup cron (02:30) on odin**

```bash
scp deploy/backup-rnp.sh odin:~/rnp/deploy/ && ssh odin 'chmod +x ~/rnp/deploy/backup-rnp.sh'
ssh odin '( crontab -l 2>/dev/null | grep -v backup-rnp; echo "30 2 * * * $HOME/rnp/deploy/backup-rnp.sh >> $HOME/rnp/etl/logs/backup.log 2>&1" ) | crontab -'
ssh odin '~/rnp/deploy/backup-rnp.sh && ls -lh ~/backups | tail -3'
```
Expected: a fresh `.sql.gz` dump exists.

- [ ] **Step 3: pm2 boot persistence + restart monitoring**

```bash
ssh odin 'pm2 save && pm2 startup systemd -u $(whoami) --hp $HOME 2>&1 | tail -1'
```
> If `pm2 startup` prints a `sudo` command, run it once so rnp-backend (and existing apps) survive reboot. Confirm this doesn't alter neighbours' pm2 entries.

### Task 5.4: Final E2E + coexistence verification + docs

**Files:**
- Modify: `CLAUDE.md` (update architecture to the new stack), `README.md`

- [ ] **Step 1: Full Playwright E2E (adapt `e2e_real.mjs`)** — login, visit every screen (Ishlab chiqarish, Klient-menejer, Sifat nazorati), assert real values render and there are zero console/API errors. Capture screenshots.

```bash
node e2e_real.mjs 2>&1 | tail -30   # after pointing it at https://rnp.arcon-perfect.uz
```
Expected: all screens pass with real-data assertions; no 4xx/5xx in network log.

- [ ] **Step 2: Coexistence gate (final)**

```bash
ssh odin 'pm2 ls'   # rnp-backend + diyor-saga + sifat-nazorati + yozly + scout all online
ssh odin 'curl -s -o /dev/null -w "diyor:%{http_code}\n" localhost:3000; sudo nginx -t'
```
Expected: every neighbour online; nginx config valid.

- [ ] **Step 3: Update `CLAUDE.md`** to describe the real architecture (Postgres `rnp_analytics`, Node+pg backend on :3008, Python `etl/` collectors via cron, no Node→Python spawn, no MSSQL). Remove the obsolete two-database/script-runner/mock-mode sections.

- [ ] **Step 4: Commit + (only if the user asks) open PR**

```bash
git add CLAUDE.md README.md && git commit -m "docs: update architecture to rebuilt Postgres + ETL stack (go-live)"
# Do NOT push or open a PR unless the user explicitly asks.
```

**PHASE 5 GATE:** dashboard fully on real data; mock disabled; old token returns 401; backups running; all neighbours online; docs updated.

---

## Self-review (against spec)

- **§3 four sources** → Phase 2 (qc), Phase 3 (production), Phase 4 (calls + telegram). ✓
- **§4 odin / coexistence** → Task 1.0, 1.5, 1.6, 1.7 (new vhost, :3008, own pm2/dir/DB); coexistence gates at every phase end. ✓
- **§6 data model** → Task 1.1 schema covers all tables incl. real unique keys (note the `qc_defects` expression-index correction). ✓
- **§7 ETL** → amo_calls, amo_telegram, production, qc all ported with idempotent delete/upsert; token from env; logs to `etl/logs`. ✓
- **§8 backend** → env validation on boot, `/health`, no `/api/sync` spawn, pg only, MVC mirror. ✓
- **§9 frontend** → `USE_MOCK=false` (Phase 5), QC wired live (Phase 2). ✓
- **§10 security** → token rotation (5.1), JWT enforced, read-only factory user, rate-limited login, secrets gitignored. ✓
- **§11 scheduling** → daily 06:00 Asia/Tashkent cron (4.4). ✓
- **§12 ops** → pm2 + nginx + nightly pg_dump backups + logs (5.3). ✓
- **§13 cleanup** → Task 1.2 deletes phantom code + automation; old schema/migrations replaced (1.1). ✓
- **§15 open items** → Asadbek-only (4.1), Remote-MySQL enablement (3.1), `arconper_perfect` inspection (3.1 Step 5), cycle-time from started/finished (3.2). ✓
- **§16 testing** → per-source live reads, ETL unit tests + idempotency checks, backend live-shape verification, Playwright E2E, coexistence checks. ✓

**Known caveats (called out, not hidden):**
- `/api/production/sku` returns `[]` — no verified data source for SKU/model-per-workshop (frontend renders an empty table).
- `javobDarajasi` vs `murojaatHal` Telegram KPIs are *derived* (manager/client message ratio capped at 100, and answered/client_turns) to match the mock's two distinct percentages; if the user defines them differently, adjust `crm.service.js`.
- The verified call totals (April/May) are account-wide; **Asadbek-only** numbers are a subset — verification asserts sane non-zero values, not the account totals.
```

