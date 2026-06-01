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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_defects ON qc_defects (stat_date, sku, reason, COALESCE(category,''));

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
