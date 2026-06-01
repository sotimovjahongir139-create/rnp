# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RNP Analytics — a business intelligence dashboard for production and CRM metrics, deployed on Ahost (cPanel). The stack has three independent layers:

- **Backend**: Node.js/Express REST API → `backend/`
- **Frontend**: React 18 + Vite SPA → `frontend/`
- **Automation**: Python ETL + scheduler → `automation/`

All three share a single MySQL database (`rnp_analytics` on Ahost). The UI is entirely in Uzbek.

## Commands

### Backend (Node.js)
```bash
cd backend
npm install
npm run dev        # nodemon watch mode, port 5000
npm start          # production
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev        # Vite dev server, port 3000
npm run build      # Output to frontend/dist/
npm run preview    # Preview production build
```

### Python Automation
```bash
cd automation
pip install -r requirements.txt
python scheduler/cron_jobs.py --job=all         # Run all ETL jobs
python scheduler/cron_jobs.py --job=production  # Production ETL only
python scheduler/cron_jobs.py --job=crm         # CRM sync only
```

### Database
```bash
# Apply schema from scratch
mysql -u user -p rnp_analytics < database/schema.sql
mysql -u user -p rnp_analytics < database/seed.sql
# Apply a migration
mysql -u user -p rnp_analytics < database/migrations/003_add_sku_table.sql
```

## Architecture

### Two-Database Pattern
`backend/src/config/db.js` creates two MySQL connection pools:
- `analyticsPool` — primary read/write DB (`rnp_analytics`)
- `productionPool` — optional read-only connection to the legacy production MySQL

All services import from `db.js` and use `analyticsPool` by default. `productionPool` is only used by `production.service.js` to pull raw order data.

### Backend Layer Separation
Each domain (production, crm, analytics, kpi) has its own `route → controller → service` chain. Controllers handle HTTP concerns; services contain all SQL. KPI thresholds and department lists live in `backend/src/config/constants.js` and are shared across services.

### Frontend Mock Mode
`frontend/src/services/api.js` has a `USE_MOCK` flag that defaults to `true` in dev mode (`import.meta.env.DEV`). All API calls return from `frontend/src/data/mockData.js` when this flag is set. To test against a real backend, set `USE_MOCK = false` manually or point `VITE_API_URL` to the backend.

### Data Polling
`frontend/src/hooks/usePolling.js` drives auto-refresh every 60 seconds (configurable via `VITE_POLL_INTERVAL`). `DashboardContext` (`frontend/src/context/DashboardContext.jsx`) holds all server state and exposes separate refresh functions per domain.

### ETL Flow
```
Legacy Production MySQL ──► production_etl.py ──► rnp_analytics.production_orders
AmoCRM API             ──► (user scripts*)    ──► rnp_analytics.amo_call_*_stats
Telegram API           ──► (user scripts*)    ──► rnp_analytics.telegram_*
                                                         │
                                                  Node.js services
                                                         │
                                                   REST API → React
```

`automation/crm/crm_sync.py` is a **placeholder** that calls user-provided scripts (`amocrm_april_report.py`, `amocrm_telegram_response.py`). Do not generate ETL logic for CRM — wait for the real scripts.

### Authentication
JWT-based. `backend/src/middleware/auth.middleware.js` validates tokens and attaches `req.user`. Two roles: `admin` (full access including `POST /api/sync`) and `manager` (read-only). Passwords are bcrypt-hashed.

## Environment Setup

Copy `.env.example` in both `backend/` and `automation/` to `.env` and fill in credentials. The frontend only needs `VITE_API_URL` and optionally `VITE_POLL_INTERVAL`.

Key backend variables:
- `ANALYTICS_DB_*` — analytics DB credentials (required)
- `PROD_DB_*` — legacy production DB (optional; if absent, production ETL is skipped)
- `JWT_SECRET` — must be set before running in production
- `CORS_ORIGIN` — must match the deployed frontend URL

## Deployment (Ahost/cPanel)

- Frontend: `npm run build` → upload `dist/` as static files
- Backend: upload `backend/` and run via Node.js app in cPanel (or PM2)
- Python ETL: configure cPanel Cron Jobs to call `python scheduler/cron_jobs.py --job=all`
- Database: MySQL databases provisioned through cPanel's MySQL Databases tool
